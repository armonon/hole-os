/* Portable metadata only. Planning is pure; the shell applies a validated plan. */
(() => {
  'use strict';
  const M = globalThis.HoleClusterModel;
  if (!M) return;
  const own = (value, key) => value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
  const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const reserved = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);
  const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{0,119}$/.test(value) && !reserved.has(value);
  const groupId = value => safeId(value) && /^group-[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(value) && !reserved.has(value.slice(6));
  const spaceId = value => ['desk', 'studio', 'life', 'overview'].includes(value) || typeof value === 'string' && /^space-[a-z0-9-]{1,60}$/.test(value);
  const name = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  const appId = value => 'app-' + value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const list = value => {
    if (Array.isArray(value)) return value;
    try { return [...Set.prototype.values.call(value)]; } catch { return []; }
  };
  const ids = value => new Set(list(value).filter(safeId));
  const catalog = value => new Set(list(value).filter(value => typeof value === 'string' && value.length <= 80 && name(value) === value && value && safeId(appId(value))));
  const copyGroups = groups => groups.map(g => ({ id: g.id, name: g.name, kind: g.kind, members: [...g.members] }));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const counter = () => ({ groupsAdded: 0, groupsKept: 0, appsAdded: 0, missingFiles: 0, skippedLinks: 0, skippedApps: 0, skippedGroups: 0, skippedProjects: 0, spacesFallback: 0 });

  function projects(current, incoming, report) {
    const result = [], known = new Set();
    for (const values of [current, incoming]) {
      if (values === incoming && Array.isArray(values)) report.skippedProjects += Math.max(0, values.length - 12);
      for (const entry of Array.isArray(values) ? values.slice(0, 12) : []) {
        const id = own(entry, 'id'), title = name(own(entry, 'name'));
        if (!/^space-[a-z0-9-]{1,60}$/.test(typeof id === 'string' ? id : '') || !title) { if (values === incoming) report.skippedProjects++; continue; }
        if (known.has(id)) continue;
        if (result.length >= 12) { if (values === incoming) report.skippedProjects++; continue; }
        known.add(id); result.push({ id, name: title.slice(0, 40) });
      }
    }
    return result;
  }
  function spacesFor(projects, report) {
    const known = new Set(['desk', 'studio', 'life', ...projects.map(p => p.id)]), missing = new Set();
    return {
      known,
      resolve(value, overview = false) {
        if (known.has(value) || overview && value === 'overview') return value;
        if (value !== undefined && !missing.has(value)) { missing.add(value); report.spacesFallback++; }
        return 'desk';
      }
    };
  }
  function views(raw, spaces) {
    const result = {};
    for (const key of [...spaces.known, 'overview', 'drawer']) {
      const value = own(raw, key), x = own(value, 'x'), y = own(value, 'y'), z = own(value, 'z');
      if ([x, y, z].every(Number.isFinite)) result[key] = { x: clamp(x, -1.8, 1.8), y: clamp(y, -1.8, 1.8), z: clamp(z, .65, 2.2) };
    }
    return result;
  }
  function geometry(raw, allowed, spaces) {
    const files = {}, placements = {};
    for (const id of allowed) {
      if (id.startsWith('local-')) continue;
      const file = own(own(raw, 'files'), id), point = own(own(raw, 'placements'), id);
      const x = own(file, 'x'), y = own(file, 'y'), px = own(point, 'x'), py = own(point, 'y');
      if ([x, y].every(Number.isFinite)) files[id] = { space: spaces.resolve(own(file, 'space')), x: clamp(x, -1050, 1050), y: clamp(y, -450, 450) };
      if ([px, py].every(Number.isFinite)) placements[id] = { x: clamp(px, 0, 1), y: clamp(py, 0, 1) };
    }
    return { files, placements };
  }
  function currentPins(state, apps, bases, spaces) {
    const seen = new Set(), pins = [];
    for (const raw of Array.isArray(own(state, 'appPins')) ? own(state, 'appPins') : []) {
      const title = own(raw, 'name'), id = typeof title === 'string' ? appId(title) : '';
      if (!apps.has(title) || !bases.has(id) || seen.has(title)) continue;
      const file = own(own(own(state, 'desk'), 'files'), id);
      seen.add(title); pins.push({ name: title, space: spaces.resolve(own(file, 'space') ?? own(raw, 'space')) });
    }
    return pins;
  }
  function parseGroups(raw) {
    if (!Array.isArray(raw) || raw.length > M.MAX_GROUPS) return null;
    const result = [], defined = new Set(), owners = new Map(); let count = 0;
    for (const value of raw) {
      if (!record(value)) return null;
      const id = own(value, 'id'), title = name(own(value, 'name')), kind = own(value, 'kind'), members = own(value, 'members');
      if (!groupId(id) || defined.has(id) || !title || title.length > 60 || !['cluster', 'folder'].includes(kind) || !Array.isArray(members)) return null;
      defined.add(id); const accepted = [];
      for (const member of members) {
        if (++count > M.MAX_MEMBERS || !safeId(member) || member.startsWith('group-') && !groupId(member) || member === id || owners.has(member)) return null;
        owners.set(member, id); accepted.push(member);
      }
      result.push({ id, name: title, kind, members: accepted });
    }
    for (const id of defined) {
      const visited = new Set(); let current = id;
      while (current) { if (visited.has(current)) return null; visited.add(current); current = owners.get(current); }
    }
    return result;
  }
  function serialize(state, { itemIds, appNames } = {}) {
    const bases = ids(itemIds), apps = catalog(appNames), report = counter();
    const projectList = projects(own(state, 'projects'), [], report), spaces = spacesFor(projectList, report);
    const clusters = M.normalize(own(state, 'clusters'), bases), appPins = currentPins(state, apps, bases, spaces);
    const allowed = new Set([...bases].filter(id => !id.startsWith('local-') && !id.startsWith('group-') && !id.startsWith('app-')));
    for (const pin of appPins) allowed.add(appId(pin.name));
    for (const g of clusters) allowed.add(g.id);
    const desk = own(state, 'desk');
    return { format: 'hole-workspace', version: 2, layout: own(state, 'layout') === 'pocket' ? 'pocket' : 'desktop', views: views(own(state, 'views'), spaces), projects: projectList, appPins, clusters: copyGroups(clusters), desk: { view: spaces.resolve(own(desk, 'view'), true), ...geometry(desk, allowed, spaces) } };
  }
  function plan(data, { state = {}, itemIds, appNames, localIds } = {}) {
    const desk = own(data, 'desk'), version = own(data, 'version');
    if (!record(data) || own(data, 'format') !== 'hole-workspace' || ![1, 2].includes(version) || !['desktop', 'pocket'].includes(own(data, 'layout')) || !record(desk) || !spaceId(own(desk, 'view'))) return null;
    if (own(data, 'projects') !== undefined && !Array.isArray(own(data, 'projects')) || own(data, 'views') !== undefined && !record(own(data, 'views'))) return null;
    let incomingGroups = [], incomingPins = [];
    if (version === 2) {
      if (Array.isArray(own(data, 'projects')) && own(data, 'projects').length > 12) return null;
      incomingGroups = parseGroups(own(data, 'clusters')); incomingPins = own(data, 'appPins');
      if (!incomingGroups || !Array.isArray(incomingPins) || incomingPins.length > 500) return null;
      const seen = new Set();
      for (const pin of incomingPins) {
        const title = own(pin, 'name'), space = own(pin, 'space');
        if (!record(pin) || typeof title !== 'string' || !title || title.length > 80 || name(title) !== title || seen.has(title) || typeof space !== 'string' || !spaceId(space) || space === 'overview') return null;
        seen.add(title);
      }
    }
    const report = counter(), bases = ids(itemIds), apps = catalog(appNames), liveFiles = ids(localIds);
    if (incomingGroups.some(g => bases.has(g.id))) return null;
    const projectList = projects(own(state, 'projects'), own(data, 'projects'), report), spaces = spacesFor(projectList, report);
    const existingGroups = M.normalize(own(state, 'clusters'), bases), existingGroupIds = new Set(existingGroups.map(g => g.id));
    const appPins = currentPins(state, apps, bases, spaces), existingApps = new Set(appPins.map(pin => appId(pin.name)));
    const acceptedApps = new Set();
    for (const pin of incomingPins) {
      const title = own(pin, 'name'), id = appId(title);
      if (!apps.has(title)) { report.skippedApps++; continue; }
      if (existingApps.has(id) || acceptedApps.has(id)) continue;
      appPins.push({ name: title, space: spaces.resolve(own(pin, 'space')) }); bases.add(id); acceptedApps.add(id); report.appsAdded++;
    }
    const clusters = copyGroups(existingGroups), incoming = [];
    for (const g of incomingGroups) {
      if (existingGroupIds.has(g.id)) { report.groupsKept++; continue; }
      if (clusters.length >= M.MAX_GROUPS) { report.skippedGroups++; continue; }
      const value = { ...g, members: [] }; clusters.push(value); incoming.push({ value, members: g.members }); report.groupsAdded++;
    }
    const acceptedGroups = new Set(incoming.map(g => g.value.id)), owners = new Set(existingGroups.flatMap(g => g.members)), missingFiles = new Set();
    let links = owners.size;
    for (const { value, members } of incoming) for (const member of members) {
      let available = true;
      if (member.startsWith('local-') && (!bases.has(member) || !liveFiles.has(member.slice(6)))) { missingFiles.add(member); available = false; }
      else if (member.startsWith('group-')) available = acceptedGroups.has(member) && !existingGroupIds.has(member);
      else available = bases.has(member);
      if (!available || owners.has(member) || links >= M.MAX_MEMBERS) { report.skippedLinks++; continue; }
      value.members.push(member); owners.add(member); links++;
    }
    report.missingFiles = missingFiles.size;
    const builtins = [...bases].filter(id => !id.startsWith('local-') && !id.startsWith('app-') && !id.startsWith('group-'));
    const all = new Set([...builtins, ...appPins.map(pin => appId(pin.name)), ...clusters.map(g => g.id)]);
    const protectedIds = new Set([...existingGroupIds, ...existingApps, ...existingGroups.flatMap(g => g.members)]);
    const importable = new Set((version === 1 ? builtins : [...all]).filter(id => !protectedIds.has(id)));
    const previousGeometry = geometry(own(state, 'desk'), all, spaces), importedGeometry = geometry(desk, importable, spaces);
    const currentOpen = own(state, 'clusterOpen');
    return {
      restore: {
        layout: own(data, 'layout'), views: { ...views(own(state, 'views'), spaces), ...views(own(data, 'views'), spaces) }, projects: projectList,
        appPins, clusters, clusterOpen: existingGroupIds.has(currentOpen) ? currentOpen : null,
        desk: { view: spaces.resolve(own(desk, 'view'), true), files: { ...previousGeometry.files, ...importedGeometry.files }, placements: { ...previousGeometry.placements, ...importedGeometry.placements } }
      }, report
    };
  }
  globalThis.HoleSetup = Object.freeze({ serialize, plan });
})();
