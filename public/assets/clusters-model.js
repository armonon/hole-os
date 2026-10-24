/* Pure logical shortcut containers. No disk folders or file bytes are changed.
 * normalize/create require the current base desktop IDs. add/canAdd receive a
 * caller-validated base item ID because their API does not include that list. */
(() => {
  'use strict';
  const MAX_GROUPS = 80, MAX_MEMBERS = 500;
  const reserved = new Set(Object.getOwnPropertyNames(Object.prototype));
  reserved.add('prototype');
  const safeId = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{0,119}$/.test(id) && !reserved.has(id);
  const groupId = id => safeId(id) && /^group-[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(id) && !reserved.has(id.slice(6));
  const isGroupReference = id => typeof id === 'string' && id.startsWith('group-');
  const own = (value, key) => Object.getOwnPropertyDescriptor(value, key)?.value;
  function cleanName(value) {
    if (typeof value !== 'string') return '';
    const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    let result = '';
    for (const character of text) {
      if (result.length + character.length > 60) break;
      result += character;
    }
    return result.trim();
  }
  function baseIds(itemIds) {
    let values = itemIds;
    if (!Array.isArray(values)) {
      // The native method accepts genuine cross-realm Sets without trusting tags
      // or a caller-provided iterator on malformed restore input.
      try { values = [...Set.prototype.values.call(itemIds)]; } catch { values = []; }
    }
    return new Set([...values].filter(safeId));
  }
  function normalize(raw, itemIds) {
    if (!Array.isArray(raw)) return [];
    const bases = baseIds(itemIds), records = [], ids = new Set();
    // Resolve the accepted group identities before considering forward references.
    for (const value of raw) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const id = own(value, 'id');
      if (!groupId(id) || bases.has(id) || ids.has(id)) continue;
      const kind = own(value, 'kind') === 'folder' ? 'folder' : 'cluster', members = own(value, 'members');
      records.push({ id, name: cleanName(own(value, 'name')) || (kind === 'folder' ? 'Untitled folder' : 'Untitled cluster'), kind, members: [], source: Array.isArray(members) ? members : [] });
      ids.add(id);
      if (records.length === MAX_GROUPS) break;
    }
    const owners = new Map();
    let count = 0;
    for (const record of records) {
      for (const item of record.source) {
        if (count >= MAX_MEMBERS) break;
        if (!safeId(item) || item === record.id || owners.has(item)) continue;
        if (isGroupReference(item) ? !ids.has(item) : !bases.has(item)) continue;
        let ancestor = record.id;
        while (ancestor && ancestor !== item) ancestor = owners.get(ancestor);
        if (ancestor === item) continue;
        record.members.push(item); owners.set(item, record.id); count++;
      }
    }
    return records.map(({ id, name, kind, members }) => ({ id, name, kind, members }));
  }
  // Operations preserve existing leaf identities. Only restore/create can verify
  // those identities against the shell's current desktop inventory.
  function forest(groups) {
    const leaves = [];
    if (Array.isArray(groups)) for (const group of groups) {
      if (!group || typeof group !== 'object') continue;
      const members = own(group, 'members');
      if (Array.isArray(members)) for (const item of members) if (!isGroupReference(item)) leaves.push(item);
    }
    return normalize(groups, leaves);
  }
  const findParent = (groups, itemId) => groups.find(group => group.members.includes(itemId)) || null;
  const memberCount = groups => groups.reduce((count, group) => count + group.members.length, 0);
  function parentOf(groups, itemId) {
    return safeId(itemId) ? findParent(forest(groups), itemId) : null;
  }
  function allowed(groups, itemId, targetId) {
    if (!safeId(itemId) || !groupId(targetId) || itemId === targetId || !groups.some(group => group.id === targetId)) return false;
    if (isGroupReference(itemId) && !groups.some(group => group.id === itemId)) return false;
    const prior = findParent(groups, itemId);
    if (prior?.id === targetId || (!prior && memberCount(groups) >= MAX_MEMBERS)) return false;
    let ancestor = targetId;
    while (ancestor) {
      if (ancestor === itemId) return false;
      ancestor = findParent(groups, ancestor)?.id;
    }
    return true;
  }
  function canAdd(groups, itemId, targetId) {
    return allowed(forest(groups), itemId, targetId);
  }
  function add(groups, itemId, targetId) {
    const next = forest(groups);
    if (!allowed(next, itemId, targetId)) return next;
    for (const group of next) group.members = group.members.filter(id => id !== itemId);
    next.find(group => group.id === targetId).members.push(itemId);
    return next;
  }
  function create(groups, specification, itemIds) {
    const bases = baseIds(itemIds), next = normalize(groups, bases);
    if (!specification || typeof specification !== 'object' || Array.isArray(specification)) return next;
    const id = own(specification, 'id'), cleaned = cleanName(own(specification, 'name'));
    const kindValue = own(specification, 'kind'), memberValue = own(specification, 'members');
    const kind = kindValue === undefined ? 'cluster' : kindValue, members = memberValue === undefined ? [] : memberValue;
    if (!groupId(id) || bases.has(id) || next.some(group => group.id === id) || next.length >= MAX_GROUPS || !cleaned || !['cluster', 'folder'].includes(kind) || !Array.isArray(members)) return next;
    const knownGroups = new Set(next.map(group => group.id)), unique = new Set();
    for (const item of members) {
      if (!safeId(item) || item === id || unique.has(item) || (isGroupReference(item) ? !knownGroups.has(item) : !bases.has(item))) return next;
      unique.add(item);
    }
    const previousLinks = [...unique].filter(item => findParent(next, item)).length;
    if (memberCount(next) - previousLinks + unique.size > MAX_MEMBERS) return next;
    for (const group of next) group.members = group.members.filter(item => !unique.has(item));
    next.push({ id, name: cleaned, kind, members: [...unique] });
    return next;
  }
  function remove(groups, itemId) {
    return forest(groups).map(group => ({ ...group, members: group.members.filter(id => id !== itemId) }));
  }
  function rename(groups, id, name) {
    const next = forest(groups), cleaned = cleanName(name);
    if (cleaned) {
      const group = next.find(value => value.id === id);
      if (group) group.name = cleaned;
    }
    return next;
  }
  function ungroup(groups, id) {
    const next = forest(groups), container = next.find(group => group.id === id);
    if (!container) return next;
    const parent = findParent(next, id);
    return next.filter(group => group.id !== id).map(group => ({
      ...group,
      members: [...new Set(group.members.flatMap(item => item === id ? (group.id === parent?.id ? container.members : []) : [item]))]
    }));
  }
  globalThis.HoleClusterModel = Object.freeze({ normalize, parentOf, canAdd, add, create, remove, rename, ungroup, MAX_GROUPS, MAX_MEMBERS });
})();
