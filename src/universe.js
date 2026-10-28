/* An optional CSS 3D view of existing project cards. The same DOM controls,
 * resource identities and canonical placements remain owned by Hole Core. */
(() => {
  'use strict';
  const mounted = new WeakMap(), live = new Set();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const radians = value => value * Math.PI / 180;
  function camera(value = {}) {
    return { x: clamp(finite(value.x), -10000, 10000), y: clamp(finite(value.y), -10000, 10000), depth: clamp(finite(value.depth), -5000, 5000), distance: clamp(finite(value.distance, 760), 120, 5000), yaw: clamp(finite(value.yaw, -12), -180, 180), pitch: clamp(finite(value.pitch, 8), -65, 65) };
  }
  function point(placement = {}, index = 0) {
    const columns = 4;
    return { x: finite(placement.x, (index % columns - 1.5) * 245), y: finite(placement.y, Math.floor(index / columns) * 280), depth: finite(placement.depth, (index % 3 - 1) * 130), rotation: clamp(finite(placement.rotation), -180, 180), scale: clamp(finite(placement.scale, 1), .25, 3) };
  }
  function projectPoint(position, view, options = {}) {
    const perspective = finite(options.perspective, 900), depth = finite(options.depth, 1);
    const x = position.x - view.x, y = position.y - view.y, z = position.depth * depth - view.depth;
    const yaw = radians(view.yaw), pitch = radians(view.pitch);
    const rx = x * Math.cos(yaw) + z * Math.sin(yaw), rz = -x * Math.sin(yaw) + z * Math.cos(yaw);
    const ry = y * Math.cos(pitch) - rz * Math.sin(pitch), dz = y * Math.sin(pitch) + rz * Math.cos(pitch) - view.distance;
    const denominator = perspective - dz;
    return { x: rx * perspective / denominator, y: ry * perspective / denominator, depth: dz, scale: perspective / denominator, behind: denominator < 80 };
  }
  function moveCamera(value, direction, distance) {
    const next = { ...value }, yaw = radians(value.yaw);
    if (direction === 'forward' || direction === 'back') { const amount = direction === 'forward' ? distance : -distance; next.depth += Math.cos(yaw) * amount; next.x -= Math.sin(yaw) * amount; }
    if (direction === 'left' || direction === 'right') { const amount = direction === 'right' ? distance : -distance; next.x += Math.cos(yaw) * amount; next.depth += Math.sin(yaw) * amount; }
    if (direction === 'up' || direction === 'down') next.y += direction === 'down' ? distance : -distance;
    return camera(next);
  }
  const themes = [{ id: 'void', name: 'Minimal Void' }, { id: 'studio', name: 'Music Studio' }, { id: 'library', name: 'Study Library' }, { id: 'gallery', name: 'Creative Gallery' }, { id: 'lab', name: 'Developer Lab' }, { id: 'home', name: 'Relaxed Home' }];
  function preferences(value = {}) {
    return { theme: themes.some(theme => theme.id === value.theme) ? value.theme : 'gallery', depth: clamp(finite(value.depth, 1), 0, 2), lighting: clamp(finite(value.lighting, .55), 0, 1) };
  }
  function element(tag, className, text) {
    const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
  }
  function formLabel(text, input) { const label = element('label', 'hu-field'); label.append(element('span', '', text), input); return label; }
  function button(text, action, className = '') {
    const node = element('button', `hc-button ${className}`, text); node.type = 'button'; node.addEventListener('click', action); return node;
  }
  function select(values) { const node = element('select', 'hc-input'); for (const value of values) { const item = element('option', '', value.name); item.value = value.id; node.append(item); } return node; }
  function input(type, value, min, max, step) { const node = element('input', 'hc-input'); node.type = type; node.value = value; if (min != null) node.min = min; if (max != null) node.max = max; if (step != null) node.step = step; return node; }
  async function mount(grid, { project, placements = [], context }) {
    mounted.get(grid)?.();
    if (!grid || !project || !context?.C) return () => {};
    const C = context.C, sceneId = `universe:${project.id}`, cards = [...grid.children].filter(node => node.dataset.assetId);
    if (!cards.length) return () => {};
    const originalStyle = grid.getAttribute('style'), originalClass = grid.className;
    const compactMedia = matchMedia('(max-width: 600px)'), motionMedia = matchMedia('(prefers-reduced-motion: reduce)');
    const supported = typeof CSS !== 'undefined' && CSS.supports('transform-style', 'preserve-3d');
    let disposed = false, mode = 'orbit', list = compactMedia.matches || motionMedia.matches || !supported;
    let frame = 0, saveTimer, lastFrame = 0, saveQueue = Promise.resolve(), audio = null;
    const keys = new Set(), pointers = new Map(); let gesture = null;
    let viewKey = compactMedia.matches ? 'compact' : 'desktop';
    const scene = await C.get('scenes', sceneId);
    if (!grid.isConnected) return () => {};
    const saved = scene?.deviceViews?.[viewKey];
    let view = camera(saved?.camera), prefs = preferences(saved?.preferences), bookmarks = scene?.bookmarks || [];
    const originalParent = grid.parentNode, root = element('section', 'hu-root'); root.dataset.theme = prefs.theme;
    originalParent.insertBefore(root, grid);
    const toolbar = element('div', 'hu-toolbar'); toolbar.setAttribute('aria-label', 'Universe navigation');
    const orbit = button('Orbit', () => setMode('orbit'));
    const explore = button('Explore', () => setMode('explore'));
    const flat = button('Return to Flat', () => { cleanup(); Promise.resolve(context.navigate({ presentation: 'flat' })).catch(context.fail); }, 'hu-flat');
    const listToggle = button(list ? 'Spatial view' : 'List view', () => setList(!list));
    const focusButton = button('Focus material', focusSelected);
    toolbar.append(orbit, explore, listToggle, flat);
    const description = element('p', 'hu-description');
    const viewport = element('div', 'hu-viewport'); viewport.tabIndex = 0; viewport.setAttribute('role', 'region'); viewport.setAttribute('aria-label', 'Spatial project. Drag empty space to orbit. Explore enables movement keys.');
    const instructionsId = `hu-help-${crypto.randomUUID()}`; description.id = instructionsId; viewport.setAttribute('aria-describedby', instructionsId);
    const floor = element('div', 'hu-floor'); floor.setAttribute('aria-hidden', 'true');
    const world = element('div', 'hu-world'); world.append(floor); viewport.append(world);
    grid.className = 'hu-objects'; grid.removeAttribute('style'); world.append(grid);
    const pad = element('div', 'hu-pad'); pad.setAttribute('aria-label', 'Camera movement');
    for (const [label, direction] of [['←', 'left'], ['↑', 'forward'], ['↓', 'back'], ['→', 'right'], ['Rise', 'up'], ['Lower', 'down']]) {
      const control = button(label, () => { view = moveCamera(view, direction, 95); draw(); scheduleSave(); }); control.setAttribute('aria-label', `Move camera ${direction}`); pad.append(control);
    }
    const zoomIn = button('＋', () => approach(-140)), zoomOut = button('−', () => approach(140)), reset = button('Overview', overview);
    zoomIn.setAttribute('aria-label', 'Move closer'); zoomOut.setAttribute('aria-label', 'Move further out'); pad.append(zoomOut, zoomIn, reset);
    const state = element('p', 'hu-state'); state.setAttribute('role', 'status'); state.setAttribute('aria-live', 'polite');
    const chooser = select(cards.map((card, index) => ({ id: String(index), name: card.querySelector('strong')?.textContent || `Material ${index + 1}` })));
    const openSelected = button('Open selected material', () => {
      const node = selected(); if (!node?.assetId) return;
      Promise.resolve(context.navigate({ assetId: node.assetId, placementId: node.placement?.id || null, scope: 'OBJECT_PREVIEW', view: 'projects' })).catch(context.fail);
    });
    const picker = element('div', 'hu-picker'); picker.append(formLabel('Material', chooser), focusButton, openSelected);
    root.append(toolbar, description, viewport, pad, picker, state);
    const nodes = cards.map((card, index) => {
      const placement = placements.find(value => value.id === card.dataset.placementId) || placements.find(value => value.resourceId === card.dataset.assetId);
      const holder = element('div', 'hu-object'); holder.dataset.assetId = card.dataset.assetId || ''; holder.append(card); grid.append(holder);
      return { card, holder, placement, position: point(placement, index), assetId: card.dataset.assetId, id: card.dataset.placementId || card.dataset.assetId || `index:${index}` };
    });
    // A stable fallback layout is scene presentation only until the user applies
    // a position. Existing x/y and depth values are never overwritten on entry.
    const defaults = scene?.defaultPositions || {};
    for (const node of nodes) if (!node.placement && defaults[node.id]) node.position = point(defaults[node.id]);
    if (!saved?.camera && nodes.length) { view.x = nodes.reduce((sum, node) => sum + node.position.x, 0) / nodes.length; view.y = nodes.slice(0, 12).reduce((sum, node) => sum + node.position.y, 0) / Math.min(nodes.length, 12); }
    const details = element('details', 'hu-settings'), summary = element('summary', '', 'Make this place yours'); details.append(summary);
    const appearance = element('div', 'hu-settings-grid');
    const theme = select(themes); theme.value = prefs.theme;
    const depth = input('range', prefs.depth, 0, 2, .05), lighting = input('range', prefs.lighting, 0, 1, .05);
    appearance.append(formLabel('Environment', theme), formLabel('Spatial depth', depth), formLabel('Depth lighting', lighting));
    const ambient = button('Ambient tones: off', toggleAmbient); appearance.append(ambient);
    const bookmarkName = input('text', ''); bookmarkName.placeholder = 'A name for this view'; bookmarkName.maxLength = 60;
    const bookmarkChoice = select([{ id: '', name: 'Choose a saved view' }]);
    const saveBookmark = button('Save view preset', () => persistBookmark().catch(context.fail));
    appearance.append(formLabel('Preset name', bookmarkName), saveBookmark, formLabel('Saved views', bookmarkChoice), button('Load view', () => restoreBookmark()));
    details.append(appearance);
    const positionDetails = element('details', 'hu-position'); positionDetails.append(element('summary', '', 'Position the selected material'));
    const positionFields = element('div', 'hu-position-grid');
    const fields = { x: input('number', 0, -10000, 10000, 10), y: input('number', 0, -10000, 10000, 10), depth: input('number', 0, -3000, 3000, 10), rotation: input('number', 0, -180, 180, 1), scale: input('number', 1, .25, 3, .05) };
    for (const [key, field] of Object.entries(fields)) positionFields.append(formLabel(key === 'depth' ? 'Depth (separate from zoom)' : key[0].toUpperCase() + key.slice(1), field));
    positionDetails.append(element('p', '', 'Apply changes to this shared placement. Camera movement does not move your files.'), positionFields, button('Apply position', () => applyPosition().catch(context.fail)));
    details.append(positionDetails); root.append(details);

    function selected() { return nodes[Number(chooser.value) || 0]; }
    function selectMaterial() {
      const selectedNode = selected();
      for (const node of nodes) node.holder.dataset.selected = String(node === selectedNode);
      if (selectedNode) for (const [key, field] of Object.entries(fields)) field.value = selectedNode.position[key];
    }
    function setMode(next) {
      cancelGesture(); mode = next; keys.clear();
      if (list && !motionMedia.matches && supported) list = false;
      draw(); if (!list) viewport.focus({ preventScroll: true });
    }
    function setList(value) {
      cancelGesture();
      list = motionMedia.matches || !supported ? true : value;
      keys.clear(); draw(); if (!list) viewport.focus({ preventScroll: true });
    }
    function approach(delta) { view = camera({ ...view, distance: view.distance + delta }); draw(); scheduleSave(); }
    function focusSelected() {
      const node = selected(); if (!node) return;
      if (list) { node.card.focus({ preventScroll: false }); return; }
      view = camera({ ...view, x: node.position.x, y: node.position.y, depth: node.position.depth * prefs.depth, distance: 420 }); draw(); scheduleSave(); viewport.focus({ preventScroll: true });
    }
    function overview() {
      const visible = nodes.slice(0, 30);
      view = camera({ x: visible.length ? visible.reduce((sum, node) => sum + node.position.x, 0) / visible.length : 0, y: visible.length ? visible.reduce((sum, node) => sum + node.position.y, 0) / visible.length : 0, distance: 850, yaw: -12, pitch: 8 }); draw(); scheduleSave();
    }
    function draw() {
      if (disposed) return;
      root.dataset.list = String(list); root.dataset.mode = mode; root.dataset.theme = prefs.theme;
      root.style.setProperty('--hu-light', String(prefs.lighting));
      orbit.setAttribute('aria-pressed', String(mode === 'orbit' && !list)); explore.setAttribute('aria-pressed', String(mode === 'explore' && !list));
      listToggle.textContent = list ? 'Spatial view' : 'List view'; listToggle.disabled = motionMedia.matches || !supported;
      pad.hidden = list; depth.disabled = list;
      const instruction = !supported ? 'This browser uses the accessible list. Your objects and editing controls are preserved.' : motionMedia.matches ? 'Reduced motion uses a stable list with no camera travel. All materials remain available.' : compactMedia.matches && list ? 'A phone-sized outline of the same place. Your desktop arrangement is unchanged.' : list ? 'Every material, in reading order. Open any item to work with it.' : mode === 'explore' ? 'Explore is active. Focus the scene: WASD moves, Q/E rises or lowers, arrows look, Shift moves faster. Escape exits Explore. Page scrolling stays available.' : 'Drag empty space to orbit. Use the camera buttons or pinch empty space to approach. Scroll normally to move through the page.';
      if (description.textContent !== instruction) description.textContent = instruction;
      if (list) {
        world.style.transform = 'none';
        for (const node of nodes) { if (!node.holder.isConnected) grid.append(node.holder); node.holder.hidden = false; node.holder.style.cssText = ''; node.card.holeLoadPreview?.(); }
        const label = `${nodes.length} materials · shared files · list view`; if (state.textContent !== label) state.textContent = label; return;
      }
      world.style.transform = `translateZ(${-view.distance}px) rotateX(${view.pitch}deg) rotateY(${view.yaw}deg) translate3d(${-view.x}px,${-view.y}px,${-view.depth}px)`;
      const size = viewport.getBoundingClientRect(), chosen = selected();
      const ordered = nodes.map(node => ({ node, projection: projectPoint(node.position, view, { depth: prefs.depth }) })).sort((a, b) => Math.hypot(a.projection.x, a.projection.y) - Math.hypot(b.projection.x, b.projection.y));
      const rendered = new Set(ordered.filter(item => !item.projection.behind && Math.abs(item.projection.x) < size.width / 2 + 250 && Math.abs(item.projection.y) < size.height / 2 + 250).slice(0, 30).map(item => item.node));
      for (const { node, projection } of ordered) {
        const hidden = !rendered.has(node); if (node.holder.hidden !== hidden) node.holder.hidden = hidden;
        if (hidden) { if (node.holder.isConnected) { node.holder.remove(); node.card.holeReleasePreview?.(); } continue; }
        if (!node.holder.isConnected) grid.append(node.holder); node.card.holeLoadPreview?.();
        node.holder.style.transform = `translate3d(${node.position.x}px,${node.position.y}px,${node.position.depth * prefs.depth}px) rotateY(${-view.yaw}deg) rotateX(${-view.pitch}deg) rotateZ(${node.position.rotation}deg) scale(${node.position.scale})`;
        node.holder.style.setProperty('--hu-brightness', String(clamp(1 - Math.max(0, -projection.depth) / 6000 * prefs.lighting, .8, 1)));
        node.holder.dataset.selected = String(node === chosen);
      }
      const label = `${rendered.size} of ${nodes.length} materials visible · List view reaches every item`; if (state.textContent !== label) state.textContent = label;
    }
    function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveView().catch(context.fail); }, 450); }
    function saveView(extra = {}) {
      const snapshot = { camera: { ...view }, preferences: { ...prefs } }, savedDevice = viewKey, defaultPositions = Object.fromEntries(nodes.filter(node => !node.placement).map(node => [node.id, node.position]));
      saveQueue = saveQueue.catch(() => {}).then(async () => {
        const current = await C.get('scenes', sceneId);
        const next = { ...(current || {}), id: sceneId, projectId: project.id, schemaVersion: 1, renderer: 'css-3d', defaultPositions: { ...(current?.defaultPositions || {}), ...defaultPositions }, deviceViews: { ...(current?.deviceViews || {}), [savedDevice]: snapshot }, ...(typeof extra === 'function' ? extra(current) : extra) };
        return C.put('scenes', next, current ? { expectedRevision: current.revision } : {});
      });
      return saveQueue;
    }
    function updateBookmarkChoices() {
      bookmarkChoice.replaceChildren(); const first = element('option', '', 'Choose a saved view'); first.value = ''; bookmarkChoice.append(first);
      for (const bookmark of bookmarks) { const option = element('option', '', bookmark.name); option.value = bookmark.id; bookmarkChoice.append(option); }
    }
    async function persistBookmark() {
      const name = bookmarkName.value.trim(); if (!name) throw new Error('Name the view before saving it.');
      const bookmark = { id: crypto.randomUUID(), name, camera: { ...view }, preferences: { ...prefs }, deviceClass: viewKey, createdAt: new Date().toISOString() };
      const savedScene = await saveView(current => { const latest = current?.bookmarks || []; if (latest.length >= 30) throw new Error('This scene already has 30 saved views.'); return { bookmarks: [...latest, bookmark] }; });
      bookmarks = savedScene.bookmarks; updateBookmarkChoices(); if (bookmarkName.value.trim() === name) bookmarkName.value = ''; context.notify('View preset saved locally.');
    }
    function restoreBookmark() {
      const bookmark = bookmarks.find(item => item.id === bookmarkChoice.value); if (!bookmark) return;
      view = camera(bookmark.camera); prefs = preferences(bookmark.preferences); theme.value = prefs.theme; depth.value = prefs.depth; lighting.value = prefs.lighting;
      draw(); scheduleSave(); context.notify('View restored. File contents and placements are unchanged.');
    }
    async function applyPosition() {
      const node = selected(); if (!node?.assetId) throw new Error('This material does not expose its saved identity. Return to Flat to open it.');
      const values = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, Number(field.value)]));
      if (Object.entries(fields).some(([key, field]) => !field.value.trim() || !Number.isFinite(values[key]) || values[key] < Number(field.min) || values[key] > Number(field.max))) throw new Error('Enter valid coordinates within the displayed limits.');
      const existing = node.placement ? await C.get('placements', node.placement.id) : null;
      if (node.placement && (!existing || existing.revision !== node.placement.revision)) throw new Error('This placement changed elsewhere. Reopen the project before applying a new position.');
      const savedPlacement = await C.put('placements', { ...(existing || {}), id: existing?.id || crypto.randomUUID(), sceneId: project.id, resourceId: node.assetId, resourceType: 'asset', policy: existing?.policy || 'latest', ...values }, existing ? { expectedRevision: existing.revision } : {});
      node.placement = savedPlacement; node.card.dataset.placementId = savedPlacement.id; node.position = point(savedPlacement); selectMaterial(); draw(); context.notify('Material position saved. Its content is unchanged.');
    }
    async function toggleAmbient() {
      if (audio) { await stopAmbient(); return; }
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) { context.notify('Ambient tones are unavailable in this browser.'); return; }
      try {
        const ac = new Audio(), gain = ac.createGain(); gain.gain.value = .015; gain.connect(ac.destination);
        const voices = [110, 164.81, 220].map(frequency => { const oscillator = ac.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = frequency; oscillator.connect(gain); oscillator.start(); return oscillator; });
        audio = { ac, voices }; await ac.resume(); ambient.textContent = 'Ambient tones: on'; ambient.setAttribute('aria-pressed', 'true');
      } catch (cause) { await stopAmbient(); context.fail(cause); }
    }
    async function stopAmbient() { const current = audio; audio = null; ambient.textContent = 'Ambient tones: off'; ambient.setAttribute('aria-pressed', 'false'); if (current) { current.voices.forEach(voice => voice.stop()); await current.ac.close().catch(() => {}); } }
    function pointerDown(event) {
      if (list || event.button !== 0 || event.target.closest('button,input,select,textarea,a,[contenteditable]')) return;
      viewport.focus({ preventScroll: true }); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); viewport.setPointerCapture(event.pointerId);
      if (pointers.size === 1) gesture = { view: { ...view }, initialView: { ...view }, x: event.clientX, y: event.clientY, moved: false };
      if (pointers.size === 2) { const values = [...pointers.values()]; gesture = { ...gesture, distance: Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y), view: { ...view } }; }
    }
    function pointerMove(event) {
      if (!gesture || !pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2 && gesture.distance) {
        const values = [...pointers.values()], separation = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
        view = camera({ ...gesture.view, distance: gesture.view.distance * gesture.distance / Math.max(20, separation) }); gesture.moved = true;
      } else {
        const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y; if (Math.hypot(dx, dy) < 6 && !gesture.moved) return;
        gesture.moved = true; view = camera({ ...gesture.view, yaw: gesture.view.yaw + dx * .16, pitch: gesture.view.pitch - dy * .13 });
      }
      draw();
    }
    function pointerEnd(event) {
      if (!pointers.has(event.pointerId)) return;
      if (event.type === 'pointercancel' || event.type === 'lostpointercapture') { cancelGesture(); return; }
      pointers.delete(event.pointerId);
      if (!pointers.size) { if (gesture?.moved) scheduleSave(); gesture = null; draw(); }
      else { const remaining = [...pointers.values()][0]; gesture = { initialView: gesture?.initialView, view: { ...view }, ...remaining, moved: gesture?.moved || false }; }
    }
    function cancelGesture() { if (!gesture) return; view = { ...(gesture.initialView || gesture.view) }; gesture = null; const captured = [...pointers.keys()]; pointers.clear(); for (const id of captured) { try { if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id); } catch {} } draw(); }
    function keyboard(event) {
      if (event.key === 'Escape') { const wasGesture = !!gesture; cancelGesture(); keys.clear(); if (wasGesture) { event.preventDefault(); event.stopPropagation(); } if (mode === 'explore') { event.preventDefault(); event.stopPropagation(); mode = 'orbit'; draw(); orbit.focus({ preventScroll: true }); } return; }
      if (list || mode !== 'explore' || event.target !== viewport || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'f') { event.preventDefault(); focusSelected(); return; }
      if (!['w', 'a', 's', 'd', 'q', 'e', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'shift'].includes(key)) return;
      event.preventDefault(); event.stopPropagation(); keys.add(key); if (!frame) { lastFrame = performance.now(); frame = requestAnimationFrame(advance); }
    }
    function advance(now) {
      frame = 0;
      if (disposed || list || mode !== 'explore' || document.hidden || !keys.size || document.activeElement !== viewport) return;
      const seconds = Math.min(.05, (now - lastFrame) / 1000); lastFrame = now;
      const amount = seconds * (keys.has('shift') ? 720 : 240);
      for (const [key, direction] of [['w', 'forward'], ['s', 'back'], ['a', 'left'], ['d', 'right'], ['q', 'up'], ['e', 'down']]) if (keys.has(key)) view = moveCamera(view, direction, amount);
      if (keys.has('arrowleft')) view.yaw -= seconds * 35; if (keys.has('arrowright')) view.yaw += seconds * 35;
      if (keys.has('arrowup')) view.pitch += seconds * 25; if (keys.has('arrowdown')) view.pitch -= seconds * 25;
      view = camera(view); draw(); frame = requestAnimationFrame(advance);
    }
    function keyup(event) { keys.delete(event.key.toLowerCase()); if (!keys.size) scheduleSave(); }
    function blur() { cancelGesture(); keys.clear(); if (frame) cancelAnimationFrame(frame); frame = 0; scheduleSave(); }
    function visibility() { if (document.hidden) { blur(); audio?.ac.suspend().catch(() => {}); } else if (audio) audio.ac.resume().catch(() => {}); }
    function motionChanged() { if (motionMedia.matches) { list = true; blur(); } draw(); }
    async function compactChanged() {
      try {
        await saveView(); if (disposed) return;
        viewKey = compactMedia.matches ? 'compact' : 'desktop';
        const current = await C.get('scenes', sceneId), profile = current?.deviceViews?.[viewKey];
        if (profile) { view = camera(profile.camera); prefs = preferences(profile.preferences); }
        list = compactMedia.matches || motionMedia.matches || !supported;
        keys.clear(); theme.value = prefs.theme; depth.value = prefs.depth; lighting.value = prefs.lighting; draw();
      } catch (cause) { context.fail(cause); }
    }
    function cleanup() {
      if (disposed) return; cancelGesture(); disposed = true; clearTimeout(saveTimer); if (frame) cancelAnimationFrame(frame); keys.clear(); pointers.clear();
      observer.disconnect(); resize.disconnect(); document.removeEventListener('visibilitychange', visibility); motionMedia.removeEventListener('change', motionChanged); compactMedia.removeEventListener('change', compactChanged);
      viewport.removeEventListener('pointerdown', pointerDown); viewport.removeEventListener('pointermove', pointerMove); viewport.removeEventListener('pointerup', pointerEnd); viewport.removeEventListener('pointercancel', pointerEnd); viewport.removeEventListener('lostpointercapture', pointerEnd); viewport.removeEventListener('keydown', keyboard); viewport.removeEventListener('keyup', keyup); viewport.removeEventListener('blur', blur); window.removeEventListener('blur', blur);
      stopAmbient();
      // Preserve a last camera without touching canonical material positions.
      saveView().catch(context.fail);
      for (const card of cards) card.holeReleasePreview?.();
      grid.replaceChildren(...cards); grid.className = originalClass; if (originalStyle == null) grid.removeAttribute('style'); else grid.setAttribute('style', originalStyle);
      if (root.isConnected) root.before(grid); root.remove(); mounted.delete(grid); live.delete(cleanup);
    }
    chooser.addEventListener('change', () => { selectMaterial(); draw(); });
    theme.addEventListener('change', () => { prefs.theme = theme.value; draw(); scheduleSave(); });
    depth.addEventListener('input', () => { prefs.depth = Number(depth.value); draw(); scheduleSave(); });
    lighting.addEventListener('input', () => { prefs.lighting = Number(lighting.value); draw(); scheduleSave(); });
    viewport.addEventListener('pointerdown', pointerDown); viewport.addEventListener('pointermove', pointerMove); viewport.addEventListener('pointerup', pointerEnd); viewport.addEventListener('pointercancel', pointerEnd); viewport.addEventListener('lostpointercapture', pointerEnd); viewport.addEventListener('keydown', keyboard); viewport.addEventListener('keyup', keyup); viewport.addEventListener('blur', blur); window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility); motionMedia.addEventListener('change', motionChanged); compactMedia.addEventListener('change', compactChanged);
    const resize = new ResizeObserver(() => draw()); resize.observe(viewport);
    const observer = new MutationObserver(() => { if (!grid.isConnected || root.closest('[hidden]')) cleanup(); }); observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    mounted.set(grid, cleanup); live.add(cleanup); updateBookmarkChoices(); selectMaterial(); draw(); context.H?.icons?.();
    return cleanup;
  }
  globalThis.HoleUniverse = Object.freeze({ mount, unmount: grid => mounted.get(grid)?.(), unmountAll: () => [...live].forEach(cleanup => cleanup()), model: Object.freeze({ camera, point, projectPoint, moveCamera, preferences }) });
})();
