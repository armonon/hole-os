/* Browser-local shortcut containers. Membership never changes file bytes. */
(() => {
  'use strict';
  const H = window.HoleOS, M = window.HoleClusterModel;
  if (!H || !M) return;
  const { state, root, deskFiles } = H;
  const DROP_DWELL = 300;
  let hover = null, hoverTimer = 0, organizeId = null, mount = null;
  const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
  const item = id => deskFiles.find(f => f.id === id);
  const group = id => state.clusters.find(g => g.id === id);
  const bases = () => deskFiles.filter(f => !f.groupId).map(f => f.id);
  const status = message => { root.querySelector('.hf-hint').textContent = message; if (mount) mount.querySelector('[role=status]').textContent = message; };
  function button(label, action, className) { const el = node('button', label, className); el.type = 'button'; el.addEventListener('click', action); return el; }
  function syncSpaces() {
    const walk = (id, space) => { const g = group(id); if (!g) return; for (const member of g.members) { if (state.desk.files[member]) state.desk.files[member].space = space; if (group(member)) walk(member, space); } };
    for (const g of state.clusters) if (!M.parentOf(state.clusters, g.id)) walk(g.id, state.desk.files[g.id]?.space || 'desk');
  }
  function refresh() {
    state.clusters = M.normalize(state.clusters, bases());
    for (const f of [...deskFiles]) if (f.groupId && !group(f.id)) { f.el?.remove(); deskFiles.splice(deskFiles.indexOf(f), 1); delete state.desk.files[f.id]; delete state.desk.placements[f.id]; }
    for (const g of state.clusters) {
      let f = item(g.id);
      if (!f) { f = { id: g.id, groupId: g.id, app: 'Clusters', space: state.desk.view === 'overview' ? 'desk' : state.desk.view, x: 0, y: 0, turn: 0 }; deskFiles.push(f); state.desk.files[g.id] ||= { space: f.space, x: 0, y: 0 }; state.desk.placements[g.id] ||= { x: .5, y: .35 }; }
      Object.assign(f, { name: g.name, kind: g.kind });
      if (!f.el) H.attachDesktopFile(f);
      f.el.querySelector('.hf-object-label').textContent = g.name;
      f.el.setAttribute('aria-label', `Open ${g.name} in Clusters`);
    }
    if (!group(state.clusterOpen)) state.clusterOpen = null;
    if (!item(organizeId)) organizeId = null;
    syncSpaces();
    if (mount) render();
  }
  function publish(message) {
    refresh(); H.selectFile(null); H.paintDesk(); H.save(); status(message);
  }
  function freePlacement(id, space) {
    const occupied = deskFiles.filter(f => f.id !== id && !M.parentOf(state.clusters, f.id) && state.desk.files[f.id]?.space === space).map(f => state.desk.placements[f.id]);
    const points = Array.from({ length: 24 }, (_, i) => ({ x: .16 + (i % 6) * .135, y: .17 + Math.floor(i / 6) * .21 }));
    return points.find(p => occupied.every(q => Math.abs(p.x - q.x) * H.deskStage.clientWidth > 90 || Math.abs(p.y - q.y) * H.deskStage.clientHeight > 80)) || points.at(-1);
  }
  function createGroup(name, kind, members = [], anchorId = null, parentId = null) {
    if (state.clusters.length >= M.MAX_GROUPS) { status(`This browser can hold up to ${M.MAX_GROUPS} Clusters and folders.`); return null; }
    if (parentId && !group(parentId)) return null;
    if (parentId && state.clusters.reduce((n, g) => n + g.members.length, 0) >= M.MAX_MEMBERS) { status('This workspace has reached its 500 grouped shortcut limit.'); return null; }
    const id = 'group-' + crypto.randomUUID(), next = M.create(state.clusters, { id, name, kind, members }, bases());
    if (!next.some(g => g.id === id)) { status('Could not create this group. Check its name and contents.'); return null; }
    const space = state.desk.files[anchorId || parentId]?.space || (state.desk.view === 'overview' ? 'desk' : state.desk.view);
    state.clusters = parentId ? M.add(next, id, parentId) : next;
    state.desk.files[id] = { space, x: state.desk.files[anchorId]?.x || 0, y: state.desk.files[anchorId]?.y || 0 };
    state.desk.placements[id] = anchorId ? { ...state.desk.placements[anchorId] } : freePlacement(id, space);
    publish(`${name} created. Originals stay in place in their apps and file library.`);
    return id;
  }
  function addItem(id, targetId) {
    if (!item(id) || !M.canAdd(state.clusters, id, targetId)) { status('That shortcut cannot be moved here.'); return false; }
    const name = item(id).name, targetName = group(targetId).name;
    state.clusters = M.add(state.clusters, id, targetId); publish(`${name} moved into ${targetName}.`); return true;
  }
  function moveOut(id) {
    const parent = M.parentOf(state.clusters, id); if (!parent || !item(id)) return;
    const space = state.desk.files[parent.id].space;
    state.clusters = M.remove(state.clusters, id); state.desk.files[id].space = space;
    state.desk.placements[id] = freePlacement(id, space); publish(`${item(id).name} returned to the desktop. The original was kept.`);
  }
  function ungroup(id) {
    const g = group(id); if (!g) return;
    const parent = M.parentOf(state.clusters, id), space = state.desk.files[id].space, children = [...g.members];
    state.clusters = M.ungroup(state.clusters, id); state.clusterOpen = parent?.id || null;
    for (const child of children) if (!parent && item(child)) { state.desk.files[child].space = space; state.desk.placements[child] = freePlacement(child, space); }
    publish(`${g.name} ungrouped. All its shortcuts and originals were kept.`);
    mount?.querySelector('button')?.focus({ preventScroll: true });
  }
  function canTarget(source, target) {
    return source && target && source.id !== target.id && !M.parentOf(state.clusters, source.id) && !M.parentOf(state.clusters, target.id) && (target.groupId ? M.canAdd(state.clusters, source.id, target.id) : state.clusters.length < M.MAX_GROUPS && state.clusters.reduce((n, g) => n + g.members.length, 0) <= M.MAX_MEMBERS - 2);
  }
  function targetAt(g, e) {
    if (!g?.file || !deskFiles.includes(g.file) || !g.file.el.isConnected || !state.desk.files[g.file.id] || state.desk.view === 'overview') return null;
    return deskFiles.find(f => {
      if (!canTarget(g.file, f) || !f.el.isConnected || f.el.hidden || state.desk.files[f.id]?.space !== state.desk.view) return false;
      const r = f.el.getBoundingClientRect(), insetX = r.width * .2, insetY = r.height * .15;
      return e.clientX >= r.left + insetX && e.clientX <= r.right - insetX && e.clientY >= r.top + insetY && e.clientY <= r.bottom - insetY;
    }) || null;
  }
  function cancelDrag() {
    clearTimeout(hoverTimer); hoverTimer = 0;
    if (hover) { hover.target.el.classList.remove('is-cluster-target', 'is-cluster-ready'); hover.target.el.removeAttribute('data-drop-label'); }
    hover = null;
  }
  function previewDrag(g, e) {
    const target = targetAt(g, e);
    if (hover?.target === target && hover.source === g.file.id) return;
    cancelDrag(); if (!target) return;
    hover = { source: g.file.id, target, since: performance.now() };
    target.el.classList.add('is-cluster-target'); target.el.dataset.dropLabel = 'Hold to group';
    hoverTimer = setTimeout(() => {
      hoverTimer = 0; if (!hover || hover.target !== target) return;
      target.el.classList.add('is-cluster-ready'); target.el.dataset.dropLabel = target.groupId ? 'Release to add' : 'Release to cluster';
    }, DROP_DWELL);
  }
  function commitDrag(g, e) {
    const target = targetAt(g, e), ready = hover && hover.source === g.file.id && hover.target === target && performance.now() - hover.since >= DROP_DWELL;
    cancelDrag(); if (!ready) return false;
    if (target.groupId) return addItem(g.file.id, target.id);
    const id = createGroup('New Cluster', 'cluster', [target.id, g.file.id], target.id);
    if (!id) return false;
    item(id)?.el.focus({ preventScroll: true }); return true;
  }
  function field(labelText, input) { const label = node('label', labelText); label.append(input); return label; }
  function selectOptions(entries, label) {
    const select = node('select'); select.setAttribute('aria-label', label);
    for (const [id, name] of entries) { const option = node('option', name); option.value = id; select.append(option); }
    return select;
  }
  function showPanel() { H.openApp('Clusters'); mount = H.windows.get('Clusters').el.querySelector('.hf-window-body'); mount.classList.add('hf-clusters'); render(); }
  function open(id, origin) {
    if (!group(id)) return;
    organizeId = null; state.clusterOpen = id;
    const space = state.desk.files[id]?.space;
    const rec = H.windows.get('Clusters'); if (rec && space) rec.space = space;
    if (space && space !== state.desk.view) H.visitSpace(space);
    H.openApp('Clusters', origin); mount = H.windows.get('Clusters').el.querySelector('.hf-window-body'); mount.classList.add('hf-clusters'); render(); H.save();
  }
  function organize(id) { if (!item(id)) return; organizeId = id; const space = state.desk.files[id]?.space, rec = H.windows.get('Clusters'); if (rec && space) rec.space = space; if (space && space !== state.desk.view) H.visitSpace(space); showPanel(); }
  function revealItem(id) { const parent = M.parentOf(state.clusters, id); if (!parent) return false; open(parent.id); mount?.querySelector(`[data-cluster-item="${id}"]`)?.focus({ preventScroll: true }); return true; }
  function render() {
    if (!mount?.isConnected) { mount = null; return; }
    const active = mount.contains(document.activeElement) ? document.activeElement : null, focused = active?.dataset.focusKey;
    const view = organizeId || state.clusterOpen || 'all', sameView = mount.dataset.view === view, draft = active?.matches('input,select') ? active.value : null; mount.dataset.view = view;
    mount.replaceChildren();
    const crumbs = node('nav', undefined, 'hf-cluster-crumbs'); crumbs.setAttribute('aria-label', 'Cluster navigation');
    crumbs.append(button('All Clusters', () => { organizeId = null; state.clusterOpen = null; render(); H.save(); }));
    const current = group(state.clusterOpen), path = []; let ancestor = current;
    while (ancestor) { path.unshift(ancestor); ancestor = M.parentOf(state.clusters, ancestor.id); }
    for (const g of path) crumbs.append(button(g.name, () => open(g.id)));
    mount.append(crumbs);
    const heading = node('h2', organizeId ? `Organize ${item(organizeId)?.name}` : current?.name || 'Clusters'); mount.append(heading);
    mount.append(node('p', 'Group app shortcuts, local files and folders. Originals stay in their apps and file library. Folders here are local shortcut containers.', 'hf-cluster-caption'));
    const live = node('p', '', 'hf-cluster-status'); live.setAttribute('role', 'status'); mount.append(live);
    if (organizeId) {
      const source = item(organizeId);
      const targets = deskFiles.filter(f => source && f.id !== source.id && (f.groupId ? M.canAdd(state.clusters, source.id, f.id) : !M.parentOf(state.clusters, f.id) && !M.parentOf(state.clusters, source.id) && state.desk.files[f.id].space === state.desk.files[source.id].space));
      const select = selectOptions(targets.map(f => [f.id, f.groupId ? `Add to ${f.name}` : `New Cluster with ${f.name}`]), 'Group with');
      const add = button('Group shortcuts', () => { const target = item(select.value), id = source?.id; if (!target || !item(id)) return; organizeId = null; if (target.groupId) { if (addItem(id, target.id)) open(target.id); } else { const created = createGroup('New Cluster', 'cluster', [target.id, id], target.id); if (created) open(created); } }); add.disabled = !targets.length;
      mount.append(field('Group with', select), add);
      if (source?.groupId) mount.append(button('Open and rename', () => open(source.id)));
      if (source && M.parentOf(state.clusters, source.id)) mount.append(button('Move to desktop', () => { organizeId = null; moveOut(source.id); }));
      mount.append(button('Cancel', () => { organizeId = null; render(); }));
      if (!targets.length) live.textContent = 'Add another desktop shortcut, or create a folder from All Clusters first.';
    } else {
      if (current) {
        const form = node('form', undefined, 'hf-cluster-rename'), input = node('input'); input.value = current.name; input.maxLength = 60; input.required = true; input.setAttribute('aria-label', 'Cluster or folder name'); input.dataset.focusKey = 'rename';
        const submit = node('button', 'Rename'); submit.type = 'submit';
        form.append(field('Name', input), submit); form.addEventListener('submit', event => { event.preventDefault(); if (!input.value.trim()) return; state.clusters = M.rename(state.clusters, current.id, input.value); publish('Name updated.'); }); mount.append(form);
      }
      const content = node('div', undefined, 'hf-cluster-list'), ids = current ? current.members : state.clusters.filter(g => !M.parentOf(state.clusters, g.id)).map(g => g.id);
      for (const id of ids) {
        const f = item(id); if (!f) continue;
        const row = node('div', undefined, 'hf-cluster-row');
        const launch = button(f.name, () => H.openDesktopItem(f, launch)); launch.dataset.clusterItem = id; launch.dataset.focusKey = 'item-' + id;
        const kind = node('small', f.groupId ? f.kind === 'folder' ? 'Folder' : 'Cluster' : f.localId ? 'Local file' : (window.HoleCapabilities?.get(f.app)?.label || 'App shortcut'));
        launch.append(kind); row.append(launch);
        const arrange = button('Organize', () => organize(id)); arrange.setAttribute('aria-label', `Organize ${f.name}`); row.append(arrange);
        if (current) { const out = button('Move out', () => moveOut(id)); out.setAttribute('aria-label', `Move ${f.name} to desktop`); row.append(out); }
        content.append(row);
      }
      if (!ids.length) content.append(node('p', current ? 'This group is empty. Add a shortcut below.' : 'Drag one desktop item onto another and pause until “Release to cluster”, or group them through Quick Tools.', 'hf-cluster-caption'));
      mount.append(content);
      if (current) {
        const candidates = deskFiles.filter(f => M.canAdd(state.clusters, f.id, current.id));
        const select = selectOptions(candidates.map(f => [f.id, f.name + (M.parentOf(state.clusters, f.id) ? ' · move from another group' : ' · desktop')]), 'Existing shortcut');
        const add = button('Move into group', () => addItem(select.value, current.id)); add.disabled = !candidates.length; mount.append(field('Existing shortcut', select), add);
      }
      const appSelect = selectOptions(H.apps.map(a => [a.name, `${a.name} · ${window.HoleCapabilities?.get(a.name)?.label || 'App shortcut'}`]), 'App shortcut');
      mount.append(field('App shortcut', appSelect), button(current ? 'Add app to group' : 'Place app on desktop', () => { const f = H.pinApp(appSelect.value); if (!f) return; if (current) addItem(f.id, current.id); else { status(`${f.name} shortcut is on the desktop.`); H.visitSpace(state.desk.files[f.id].space); if (!revealItem(f.id)) f.el.focus({ preventScroll: true }); } }));
      const create = node('form', undefined, 'hf-cluster-create'), name = node('input'); name.maxLength = 60; name.required = true; name.placeholder = 'Folder name'; name.setAttribute('aria-label', 'New folder name');
      const submit = node('button', 'Create folder'); submit.type = 'submit'; create.append(field('New folder', name), submit);
      create.addEventListener('submit', event => { event.preventDefault(); const id = createGroup(name.value.trim(), 'folder', [], null, current?.id); if (id) open(id); }); mount.append(create);
      if (current) { mount.append(button('Ungroup · keep contents', () => ungroup(current.id), 'hf-cluster-ungroup')); }
    }
    for (const control of mount.querySelectorAll('button,input,select')) control.dataset.focusKey ||= control.getAttribute('aria-label') || control.textContent;
    if (active) { const next = sameView && focused ? [...mount.querySelectorAll('[data-focus-key]')].find(el => el.dataset.focusKey === focused) : null; if (next && draft !== null && next.matches('input,select')) next.value = draft; (next || mount.querySelector('button'))?.focus({ preventScroll: true }); }
  }
  const controls = root.querySelector('.hf-workspace-controls');
  const manage = button('Clusters', () => { organizeId = null; state.clusterOpen = null; showPanel(); }, 'hf-clusters-launch'); manage.setAttribute('aria-label', 'Clusters and desktop apps'); controls.append(manage);
  root.addEventListener('hole:window-change', event => {
    const { type, rec } = event.detail;
    if (rec.app.name !== 'Clusters') return;
    if (type === 'create' || type === 'open') { mount = rec.el.querySelector('.hf-window-body'); mount.classList.add('hf-clusters'); render(); }
    if (type === 'closed') mount = null;
  });
  window.HoleClusters = { open, organize, revealItem, refresh, syncSpaces, previewDrag, commitDrag, cancelDrag };
  refresh(); H.paintDesk();
})();
