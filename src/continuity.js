/* Hole's shared project surface. Presentation never owns the underlying files. */
(() => {
  'use strict';
  const H = window.HoleOS, C = window.HoleCore;
  if (!H || !C) return;
  const uid = () => crypto.randomUUID();
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const icon = name => { const n = el('i'); n.dataset.lucide = name; n.setAttribute('aria-hidden', 'true'); return n; };
  const button = (label, glyph, action, cls = '') => { const n = el('button', 'hc-button ' + cls); n.type = 'button'; n.setAttribute('aria-label', label); n.title = label; if (glyph) n.append(icon(glyph)); n.append(el('span', '', label)); n.addEventListener('click', () => Promise.resolve().then(action).catch(fail)); return n; };
  const input = (label, type = 'text', value = '') => { const wrap = el('label', 'hc-label', label); const n = el(type === 'textarea' ? 'textarea' : 'input', 'hc-input'); if (type !== 'textarea') n.type = type; n.value = value; wrap.append(n); return { wrap, input: n }; };
  const date = at => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const kindIcon = a => ({ text: 'file-text', image: 'image', audio: 'audio-lines', video: 'film', link: 'link' }[a.kind] || 'file');
  let navigation = { scope: 'WORLD', spaceId: 'desk', projectId: null, assetId: null, view: 'projects', presentation: 'flat' };
  let renderQueue=Promise.resolve(), portfolioSession=null, pressKitSession=null;
  async function leavePublish(){await pressKitSession?.beforeLeave();if(portfolioSession){await portfolioSession.dispose();portfolioSession=null;}if(pressKitSession){await pressKitSession.dispose();pressKitSession=null;}}
  let navRecord, renderEpoch = 0, urls = [], editor = null, navigationQueue = Promise.resolve(), persistQueue = Promise.resolve(), toastTimer, lastFocus, restored = false, modalClosing = Promise.resolve(), renderRequested = false, projectNames = new Map();
  const surface = el('section', 'hc-workspace'); surface.hidden = true; surface.setAttribute('aria-label', 'Your Hole workspace');
  const header = el('header', 'hc-header'); const brand = el('div', 'hc-wordmark'); brand.append(el('span', 'hc-emblem', '◎'), el('span', '', 'Make yourself at home.'));
  const headerActions = el('div', 'hc-header-actions');
  headerActions.append(button('Find anything', 'search', showSearch), button('Running studios', 'panels-top-left', showStudios), button('Capture', 'plus', () => capture()), button('Desktop', 'minimize-2', close));
  header.append(brand, headerActions);
  const shell = el('div', 'hc-shell'), sidebar = el('nav', 'hc-sidebar'); sidebar.setAttribute('aria-label', 'Your work');
  const main = el('main', 'hc-main'); main.tabIndex = -1; shell.append(sidebar, main); surface.append(header, shell); H.field.insertBefore(surface, H.windowLayer);
  const toast = el('div', 'hc-toast'); toast.hidden = true; toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); H.os.append(toast);
  const carryBar = el('aside', 'hc-carry'); carryBar.setAttribute('aria-label', 'Carry shelf'); carryBar.append(button('Carry', 'archive', () => open('carry')), el('span', 'hc-carry-count', '0')); H.field.append(carryBar);
  const toolbar = el('div', 'hc-toolbar'); toolbar.setAttribute('aria-label', 'System tools'); toolbar.append(button('Your work', 'orbit', () => open('projects')), button('Capture', 'plus', () => capture()), button('Actions', 'wand-sparkles', () => open('actions')), button('History', 'history', () => open('history')), button('Find', 'search', showSearch)); H.root.querySelector('.hf-controls').append(toolbar);
  const entries = [['projects', 'Your spaces', 'orbit'], ['day', 'Day', 'sun'], ['capture', 'Capture', 'plus-circle'], ['paperwork', 'Paperwork', 'files'], ['bounce','Bounce listening','headphones'], ['librarian','Librarian reading','book-open'], ['carry', 'Carry', 'archive'], ['actions', 'Actions', 'workflow'], ['history', 'History', 'history'], ['create', 'Create', 'blocks'], ['weblab', 'WebLab projects', 'code-2'], ['lab', 'Lab', 'flask-conical'], ['rack', 'Rack prototype', 'sliders-horizontal'], ['atlas', 'Atlas', 'map'], ['tongue', 'Tongue', 'languages'], ['crew', 'Crew', 'workflow'], ['momentous', 'Momentous', 'package'], ['publish', 'Publish', 'package'], ['relay', 'Shared spaces', 'radio'], ['settings', 'Storage & recovery', 'hard-drive'], ['catalog', 'App catalog', 'grid-2x2']];
  entries.forEach(([view, label, glyph], index) => { if (index === 5) sidebar.append(el('div', 'hc-nav-group', 'Throughout Hole')); const n = button(label, glyph, () => open(view)); n.className = 'hc-nav'; n.dataset.view = view; n.title = label; sidebar.append(n); });
  sidebar.append(el('div', 'hc-sidebar-foot', 'Your work stays here.\nSaved locally in this browser.'));

  function notify(message) { toast.textContent = message; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 4400); }
  function fail(error) {
    const message = error?.message || 'That change could not be completed. Your work has been kept.';
    const dialog = H.os.querySelector('.hc-dialog[open]');
    if (dialog) {
      let alert = dialog.querySelector('.hc-operation-error');
      if (!alert) { alert = status(message, true, dialog); alert.classList.add('hc-operation-error'); }
      else alert.textContent = message;
    } else notify(message);
    console.warn('Hole operation:', error);
  }
  function status(message, error = false, target = main) { const n = el('p', 'hc-status', message); n.dataset.error = String(error); n.setAttribute('role', error ? 'alert' : 'status'); target.append(n); return n; }
  function download(blob, name) { const href = URL.createObjectURL(blob), a = el('a'); a.href = href; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(href), 30000); }
  function objectURL(blob) { const url = URL.createObjectURL(blob); urls.push(url); return url; }
  function cleanURLs() { urls.forEach(URL.revokeObjectURL); urls = []; }
  function animate() {
    H.icons();
    if (H.motion() && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Keep the scroll/focus host stable when a native modal has just closed.
      const heading = main.querySelector('.hc-title-row');
      heading?.animate([{ opacity: .45, transform: 'translateY(7px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
  async function put(type, record) { return C.put(type, record, record.revision ? { expectedRevision: record.revision } : {}); }
  async function persistNavigation() { const value = { ...navigation }; persistQueue = persistQueue.catch(() => {}).then(async () => { const record = { ...(navRecord || {}), id: 'navigation', value }; navRecord = await put('settings', record); }); return persistQueue; }
  function path(next = navigation) { return '#/work/' + [next.view, next.spaceId || '-', next.projectId || '-', next.assetId || '-'].map(encodeURIComponent).join('/'); }
  function navigate(next, options = {}) { navigationQueue = navigationQueue.catch(() => {}).then(() => performNavigation(next, options)); return navigationQueue; }
  async function performNavigation(next, options = {}) {
    await leavePublish(); await window.HoleLibraries?.beforeLeave?.(); await window.HoleExtensions?.beforeLeave?.(); await window.HoleWorldTools?.beforeLeave?.(); window.HoleWorldTools?.dispose?.();
    if (editor && !await finishEditing()) return false;
    if (next.projectId) {
      const project = await C.get('projects', next.projectId);
      if (project) {
        projectNames.set(project.id, project.name);
        if (project.spaceId && !next.spaceId) next = { ...next, spaceId: project.spaceId };
      }
    }
    navigation = { ...navigation, ...next, versionId: next.versionId || null }; if (next.assetId === null) navigation.scope = next.projectId ? 'PROJECT' : next.spaceId && next.spaceId !== 'overview' ? 'SPACE' : 'WORLD';
    await persistNavigation();
    if (!options.fromHistory && location.hash !== path()) history.pushState({ hole: true, navigation: { ...navigation } }, '', path());
    await render(); return true;
  }
  async function open(view = 'projects', next = {}) {
    await C.ready; window.HoleWelcome?.close(); window.HoleWelcome?.closeControls(); window.HoleWelcome?.closeAbout(); H.closeDrawer({ restoreFocus: false });
    lastFocus = document.activeElement; surface.hidden = false; H.os.classList.add('hc-active'); carryBar.hidden = false;
    await navigate({ view, ...next });
  }
  async function close() { await leavePublish(); await window.HoleLibraries?.beforeLeave?.(); await window.HoleExtensions?.beforeLeave?.(); await window.HoleWorldTools?.beforeLeave?.(); window.HoleWorldTools?.dispose?.(); if (editor && !await finishEditing()) return; surface.hidden = true; H.os.classList.remove('hc-active'); cleanURLs(); H.root.querySelector('.hf-desk-stage').focus?.({ preventScroll: true }); }
  function title(kicker, name, subtitle, actions = []) { const row = el('div', 'hc-title-row'), copy = el('div'); copy.append(el('p', 'hc-kicker', kicker), el('h1', '', name)); if (subtitle) copy.append(el('p', 'hc-subtitle', subtitle)); row.append(copy); const tools = el('div', 'hc-row'); tools.append(...actions); if((['day','paperwork','bounce'].includes(navigation.view)||navigation.view==='librarian'&&navigation.assetId)&&window.HoleToolWindows)tools.append(button('Open '+({day:'Day',paperwork:'Paperwork',bounce:'Bounce',librarian:'Librarian'}[navigation.view])+' in a window','panels-top-left',()=>openToolWindow(navigation.view)));row.append(tools); main.append(row); }
  function section(name) { const n = el('section', 'hc-section'); if (name) n.append(el('h2', '', name)); main.append(n); return n; }
  function empty(text, action) { const n = el('div', 'hc-empty', text); if (action) { n.append(el('br'), action); } return n; }
  function modal(name, description) { const d = el('dialog', 'hc-dialog'); d.setAttribute('aria-label', name); d.append(el('h2', '', name)); if (description) d.append(el('p', '', description)); const origin = document.activeElement; H.os.append(d); const nativeClose = d.close.bind(d); let finishClose; d.close = (...args) => { if (d.open) modalClosing = new Promise(resolve => { finishClose = resolve; }); nativeClose(...args); }; d.addEventListener('close', () => { setTimeout(() => { d.remove(); if (origin?.isConnected) origin.focus({ preventScroll: true }); finishClose?.(); if (renderRequested) { renderRequested = false; render().catch(fail); } }, 0); }); d.addEventListener('keydown', e => e.stopPropagation()); d.showModal(); return d; }
  function breadcrumbs() { const n = el('nav', 'hc-breadcrumbs'); n.setAttribute('aria-label', 'Current visit path'); n.append(button('Your spaces', null, () => navigate({ view: 'projects', scope: 'WORLD', spaceId: 'overview', projectId: null, assetId: null }))); if (navigation.spaceId && navigation.spaceId !== 'overview') n.append(el('span', '', '/'), button(H.state.projects?.find(s => s.id === navigation.spaceId)?.name || ({ desk: 'My desk', studio: 'Studio', life: 'Life' }[navigation.spaceId] || 'Space'), null, () => navigate({ scope: 'SPACE', projectId: null, assetId: null, view: 'projects' }))); if (navigation.projectId) n.append(el('span', '', '/'), button(projectNames.get(navigation.projectId) || 'Project', null, () => navigate({ scope: 'PROJECT', assetId: null, view: 'projects' }))); if (navigation.assetId && ['projects','history'].includes(navigation.view)) n.append(el('span', '', 'Object')); main.append(n); }
  function render() { const next=renderQueue.catch(()=>{}).then(performRender);renderQueue=next;return next; }
  async function performRender() {
    if (H.os.querySelector('.hc-dialog[open]')) { renderRequested = true; return; }
    await modalClosing;
    await leavePublish(); await window.HoleLibraries?.beforeLeave?.(); await window.HoleExtensions?.beforeLeave?.(); await window.HoleWorldTools?.beforeLeave?.();
    const epoch = ++renderEpoch; await window.HoleSpatial?.unmount(); window.HoleUniverse?.unmount?.(main.querySelector('.hu-stage')); cleanURLs(); main.replaceChildren(); surface.dataset.presentation = navigation.presentation; sidebar.querySelectorAll('[data-view]').forEach(n => n.setAttribute('aria-current', n.dataset.view === navigation.view ? 'page' : 'false'));
    breadcrumbs();
    try {
      if (navigation.assetId && navigation.view === 'projects') await renderObject(epoch);
      else if (navigation.view === 'projects') await renderProjects(epoch);
      else if (navigation.view === 'capture') await renderCapture();
      else if (navigation.view === 'paperwork') await renderPaperwork();
      else if (navigation.view === 'bounce') await HoleLibraries.listening(context());
      else if (navigation.view === 'librarian') await HoleLibraries.reading(context(),navigation.assetId ? {assetId:navigation.assetId,versionId:navigation.versionId} : null);
      else if (navigation.view === 'day') await renderDay();
      else if (navigation.view === 'carry') await renderCarry();
      else if (navigation.view === 'history') await renderHistory();
      else if (navigation.view === 'actions') await renderActions();
      else if (navigation.view === 'publish') await renderPublish();
      else if (navigation.view === 'settings') await renderStorage();
      else if (navigation.view === 'catalog') renderCatalog();
      else if (['atlas', 'tongue'].includes(navigation.view) && window.HoleWorldTools?.render) await window.HoleWorldTools.render(navigation.view, context());
      else if (navigation.view === 'rack' && window.HoleRack?.render) await window.HoleRack.render(context());
      else if (navigation.view === 'relay' && window.HoleRelay?.render) await window.HoleRelay.render(context());
      else if (window.HoleExtensions?.render) await window.HoleExtensions.render(navigation.view, context());
      else { title('CREATE', 'An instrument of your own.', 'Save a useful arrangement of your project’s material and tools.'); await renderInstruments(); }
      if (epoch !== renderEpoch) return; animate(); updateCarry();
    } catch (error) { status(error.message, true); H.icons(); }
  }
  function context() { return { H, C, main, navigation, el, icon, button, input, title, section, empty, modal, status, notify, fail, put, download, objectURL, open, navigate, render, capture, card, context, showSearch }; }
  async function card(asset, placement, lazy = false) {
    const n = el('button', 'hc-card'); n.type = 'button'; n.dataset.assetId = asset.id; if (placement) n.dataset.placementId = placement.id; n.setAttribute('aria-label', 'Open ' + asset.name); const preview = el('div', 'hc-card-preview');
    let loading = null, previewURL = null, generation = 0;
    n.holeReleasePreview = () => { generation++; loading = null; if (previewURL) URL.revokeObjectURL(previewURL); previewURL = null; preview.replaceChildren(); };
    n.holeLoadPreview = () => loading ||= (async () => {
      const token = generation, epoch = renderEpoch;
      try { const read = await C.readAsset(asset.id, placement?.policy === 'pinned' ? placement.versionId : undefined); if (token !== generation || epoch !== renderEpoch) return;
        if (asset.kind === 'image') { const img = el('img'); img.alt = asset.name; previewURL = objectURL(read.blob); img.src = previewURL; preview.append(img); }
        else if (asset.kind === 'text' || asset.mime?.startsWith('text/')) { const text = await read.blob.text(); if (token === generation && epoch === renderEpoch) preview.textContent = text.slice(0,240); }
        else { const circle = el('div','hc-card-icon'); circle.append(icon(kindIcon(asset))); preview.append(circle); }
      } catch { if (token === generation) preview.textContent = 'Content unavailable. Open for recovery options.'; }
    })();
    if (!lazy) await n.holeLoadPreview();
    n.append(preview, el('strong', '', asset.name), el('small', '', placement?.policy === 'pinned' ? 'Pinned version · stays approved' : 'Current version · saved locally'));
    n.addEventListener('click', () => navigate({ assetId: asset.id, placementId: placement?.id || null, scope: 'OBJECT_PREVIEW', view: 'projects' }).catch(fail)); n.addEventListener('contextmenu', e => { e.preventDefault(); quickTools(asset, placement); });
    let hold; n.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') hold = setTimeout(() => quickTools(asset, placement), 600); }); ['pointerup', 'pointercancel', 'pointermove'].forEach(type => n.addEventListener(type, () => clearTimeout(hold)));
    return n;
  }
  async function renderProjects(epoch) {
    const projects = await C.list('projects'); projectNames = new Map(projects.map(p => [p.id, p.name])); const assets = (await C.list('assets')).filter(a => a.state !== 'trashed');
    if (navigation.projectId) {
      const project = projects.find(p => p.id === navigation.projectId); if (!project) { title('MISSING PROJECT', 'This place is unavailable.', 'Return to your spaces to find another project.', [button('Your spaces', 'arrow-left', () => navigate({ projectId: null, assetId: null }))]); return; }
      title(project.fixture ? 'INTERACTION STUDY · DISPOSABLE DATASET' : 'PROJECT', project.name, 'Your materials, their connections, and the thought you left unfinished.', [button('Capture here', 'plus', () => capture(project.id), 'hc-primary'), button('New animation','clapperboard',()=>newAnimation(project.id)), button('New garment','shirt',()=>HoleGhostAuthoring.create(context())), button('New board','layout',()=>HoleMoodboard.create(context())), button('Link material', 'link', () => linkMaterial(project)), button('Save arrangement', 'bookmark', snapshot)]);
      const views = el('div', 'hc-row'); ['flat', 'canvas', 'smart', 'universe'].forEach(view => { const b = button(view === 'flat' ? 'Desktop' : view === 'canvas' ? 'Canvas' : view === 'smart' ? 'Smart Screen' : 'Universe', view === 'flat' ? 'layout-grid' : view === 'smart' ? 'panels-top-left' : 'orbit', () => setPresentation(view)); b.setAttribute('aria-pressed', String(navigation.presentation === view)); views.append(b); }); main.append(views);
      if (navigation.presentation === 'smart') { const note = el('div', 'hc-note', 'Temporary arrangement. Your desktop positions are unchanged.'); note.append(el('br'), button('Save as an instrument', 'bookmark', saveInstrument), button('Return to Desktop', 'arrow-left', () => setPresentation('flat'))); main.append(note); }
      const placements = (await C.list('placements')).filter(p => p.sceneId === project.id && p.resourceType === 'asset'); const members = new Set([...(project.assetIds || []), ...placements.map(p => p.resourceId)]); const cards = section('Materials'); const grid = el('div', 'hc-grid'); grid.dataset.project = project.id; cards.append(grid);
      for (const a of assets.filter(a => members.has(a.id) || a.projectId === project.id)) { if (epoch !== renderEpoch) return; const refs = placements.filter(p => p.resourceId === a.id); for (const placement of refs.length ? refs : [null]) grid.append(await card(a, placement, navigation.presentation === 'universe')); }
      if (!grid.children.length) grid.append(empty('A place for your next thought.', button('Create a note', 'file-plus', () => capture(project.id))));
      if (navigation.presentation === 'universe') await window.HoleUniverse?.mount?.(grid, { project, placements, context: context() });
      if (navigation.presentation === 'canvas') await window.HoleSpatial?.mount?.(grid, { project, placements, context: context() });
      if (navigation.presentation === 'smart') await window.HoleSpatial?.smart?.(grid, { project, placements, context: context() });
      const kit = section('Project kit'); const colors = input('Colors (comma-separated hex values)', 'text', (project.kit?.colors || []).join(', ')); kit.append(colors.wrap, button('Save project colors', 'palette', async () => { const latest = await C.get('projects', project.id); const values = colors.input.value.split(',').map(s => s.trim()).filter(Boolean); if (values.some(s => !/^#[0-9a-f]{6}$/i.test(s))) throw new Error('Use six-digit hex colors, such as #746590.'); await put('projects', { ...latest, kit: { ...latest.kit, colors: values } }); notify('Project kit saved locally.'); }));
      if (window.HoleMemoryUI) { const memory = section('Optional project memory'); await HoleMemoryUI.mount(memory, {core:C,projectId:project.id,onSource:ref=>open('history',{assetId:ref.assetId,projectId:project.id})}); }
      if (project.fixture) kit.append(button('Reset this test dataset', 'rotate-ccw', () => resetFixture(project)));
      return;
    }
    const isWorld = navigation.scope === 'WORLD' || navigation.spaceId === 'overview';
    title(isWorld ? 'YOUR WORLD' : 'A PLACE TO RETURN TO', isWorld ? 'Room for your life.' : ({ desk: 'My desk', studio: 'Studio', life: 'Life' }[navigation.spaceId] || H.state.projects?.find(p => p.id === navigation.spaceId)?.name || 'Your space'), 'Keep a thought, follow an idea, make something your own.', [button('New project', 'plus', createProject, 'hc-primary')]);
    if (isWorld) { const spaces = [{ id: 'desk', name: 'My desk', icon: 'sun' }, { id: 'studio', name: 'Studio', icon: 'sparkles' }, { id: 'life', name: 'Life', icon: 'leaf' }, ...(H.state.projects || []).map(s => ({ ...s, icon: 'orbit' }))]; const grid = el('div', 'hc-space-grid'); for (const space of spaces) { const b = el('button', 'hc-space-card'); const planet = el('span', 'hc-planet'); planet.append(icon(space.icon)); b.append(planet, el('strong', '', space.name), el('small', '', `${projects.filter(p => p.spaceId === space.id).length} projects`)); b.addEventListener('click', () => { H.visitSpace(space.id); navigate({ scope: 'SPACE', spaceId: space.id, projectId: null, assetId: null }).catch(fail); }); grid.append(b); } main.append(grid); }
    const linkedProjects = (await C.list('placements')).filter(p => p.resourceType === 'project' && p.sceneId === navigation.spaceId);
    const list = isWorld ? projects : projects.filter(p => p.spaceId === navigation.spaceId || linkedProjects.some(link => link.resourceId === p.id)); const area = section(isWorld ? 'Your projects' : 'Places for unfinished thoughts'); const grid = el('div', 'hc-grid'); area.append(grid);
    list.forEach(project => { const b = el('button', 'hc-card'); const circle = el('div', 'hc-card-icon'); circle.append(icon('layers')); b.append(circle, el('strong', '', project.name), el('small', '', `${(project.assetIds || []).length} materials${project.fixture ? ' · Test dataset' : ''}`)); b.addEventListener('click', () => navigate({ spaceId: project.spaceId, projectId: project.id, assetId: null, scope: 'PROJECT' }).catch(fail)); grid.append(b); });
    if (!isWorld) area.append(button('Link an existing project here', 'link', async () => { const d = modal('Link a project', 'The project keeps its original ownership and materials.'); for (const project of projects.filter(p => !list.some(existing => existing.id === p.id))) d.append(button(project.name, 'layers', async () => { await put('placements', { id: uid(), sceneId: navigation.spaceId, resourceType: 'project', resourceId: project.id, policy: 'latest', x: 0, y: 0, depth: 0 }); d.close(); await render(); })); d.append(button('Close', 'x', () => d.close())); }));
    if (!list.length) area.append(empty('Start a project, then give your ideas a place to live.', button('New project', 'plus', createProject)));
    const study = section(); study.append(button('Try the Night garden interaction study', 'flask-conical', createFixture)); study.append(el('p', 'hc-subtitle', 'Creates a labeled, disposable project to explore notes, linked images, and History.'));
  }
  async function createProject() { const d = modal('A place for an idea.', 'Projects keep related material together across your spaces.'); const name = input('Project name', 'text', ''); const select = el('select', 'hc-input'); [{ id: 'desk', name: 'My desk' }, { id: 'studio', name: 'Studio' }, { id: 'life', name: 'Life' }, ...(H.state.projects || [])].forEach(s => { const o = el('option', '', s.name); o.value = s.id; select.append(o); }); select.value = navigation.spaceId === 'overview' ? 'desk' : navigation.spaceId; const label = el('label', 'hc-label', 'Space'); label.append(select); d.append(name.wrap, label, button('Create project', 'plus', async () => { if (!name.input.value.trim()) { name.input.focus(); return; } const p = await put('projects', { id: uid(), name: name.input.value.trim().slice(0, 100), spaceId: select.value, assetIds: [], kit: { colors: [], fonts: [] } }); d.close(); await navigate({ scope: 'PROJECT', spaceId: p.spaceId, projectId: p.id, assetId: null, view: 'projects' }); }, 'hc-primary'), button('Cancel', 'x', () => d.close())); name.input.focus(); H.icons(); }
  async function createFixture() {
    const existing = (await C.list('projects')).find(p => p.fixture === 'night-garden'); if (existing) { await open('projects', { spaceId: 'studio', projectId: existing.id, assetId: null, scope: 'PROJECT' }); return; }
    const p = await put('projects', { id: uid(), name: 'Night garden', fixture: 'night-garden', spaceId: 'studio', assetIds: [], kit: { colors: ['#746590', '#d9bbad'], fonts: [] } });
    const note = await C.importAsset({ name: 'First thought.md', kind: 'text', blob: new Blob(['A garden after dark.\n\nWhat would it feel like to hear the flowers open?\n\nLeave your next thought here.'], { type: 'text/markdown' }), projectId: p.id, spaceId: 'studio', provenance: { fixture: 'night-garden' } });
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480; const ctx = canvas.getContext('2d'); const gradient = ctx.createLinearGradient(0, 0, 640, 480); gradient.addColorStop(0, '#454055'); gradient.addColorStop(1, '#a8b7a4'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 640, 480); for (let i = 0; i < 7; i++) { ctx.fillStyle = ['#e4c6bd', '#c6b8db', '#e2d6ad'][i % 3]; ctx.beginPath(); ctx.ellipse(100 + i * 75, 270 + Math.sin(i) * 70, 45, 95, i / 2, 0, Math.PI * 2); ctx.fill(); }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); const image = await C.importAsset({ name: 'Garden study.png', kind: 'image', blob, projectId: p.id, spaceId: 'studio', provenance: { fixture: 'night-garden' } });
    await put('placements', { id: uid(), sceneId: p.id, resourceId: note.asset.id, resourceType: 'asset', policy: 'latest', x: 0, y: 0, depth: 0 });
    await put('placements', { id: uid(), sceneId: p.id, resourceId: image.asset.id, resourceType: 'asset', policy: 'latest', x: 230, y: 0, depth: -100 });
    await put('placements', { id: uid(), sceneId: p.id, resourceId: image.asset.id, resourceType: 'asset', policy: 'pinned', versionId: image.version.id, x: 460, y: 0, depth: 100 });
    await open('projects', { spaceId: 'studio', projectId: p.id, assetId: null, scope: 'PROJECT' });
  }
  async function resetFixture(project) { if (project.fixture !== 'night-garden') return; for (const a of await C.list('assets')) if (a.projectId === project.id && a.provenance?.fixture === 'night-garden') await C.trashAsset(a.id); for (const p of await C.list('placements')) if (p.sceneId === project.id) await C.deleteRecord('placements', p.id, { expectedRevision: p.revision }); await C.deleteRecord('projects', project.id, { expectedRevision: project.revision }); await navigate({ projectId: null, assetId: null, scope: 'SPACE' }); notify('Test dataset moved out of your workspace. Its files remain recoverable in Trash.'); }
  async function linkMaterial(project) { const d = modal('Link material here.', 'A link uses the same asset. Pin an approved version to keep it unchanged.'); const list = el('div', 'hc-search-results'); for (const a of (await C.list('assets')).filter(a => a.state === 'active')) list.append(button(a.name, kindIcon(a), async () => { await put('placements', { id: uid(), sceneId: project.id, resourceId: a.id, resourceType: 'asset', policy: 'latest', x: 0, y: 0, depth: 0 }); d.close(); await render(); })); d.append(list, button('Close', 'x', () => d.close())); H.icons(); }
  async function setPresentation(presentation) { navigation.presentation = presentation; await persistNavigation(); if (editor) { surface.dataset.presentation = presentation; await window.HoleRuntime?.present(editor.instanceId, presentation === 'flat' ? 'window' : 'canvas'); notify('View changed. Your editor and draft remain open.'); } else await render(); }

  /* Object previews and editors intentionally use separate states. */
  async function renderObject(epoch) {
    const asset = await C.get('assets', navigation.assetId); if (!asset || asset.state === 'trashed') { title('UNAVAILABLE OBJECT', 'This material is no longer here.', 'Its placement may still exist. Check Trash or return to your project.', [button('Back to project', 'arrow-left', () => navigate({ assetId: null }))]); return; }
    const placement = navigation.placementId ? await C.get('placements', navigation.placementId) : null; const pinned = placement?.policy === 'pinned' || !!navigation.versionId; const record = await C.readAsset(asset.id, navigation.versionId || (pinned ? placement.versionId : undefined)); if (epoch !== renderEpoch) return;
    title(pinned ? 'PINNED VERSION' : 'LIVE OBJECT', asset.name, `Same asset across your spaces · ${date(record.version.createdAt)}`, [button('Further out', 'arrow-left', () => navigate({ assetId: null, scope: 'PROJECT' })), button('Quick Tools', 'ellipsis', () => quickTools(asset, placement))]);
    if (pinned) main.append(el('div', 'hc-history-label', 'This placement is pinned. Editing elsewhere will not change this approved version.'));
    if (await window.HoleExtensions?.openAsset?.(record, context())) return;
    const actions = el('div', 'hc-row');
    if (asset.mime?.startsWith('text/')) { const text = await record.blob.text(); main.append(el('div', 'hc-preview', text || 'An empty thought, ready when you are.')); actions.append(button(pinned ? 'Edit latest' : 'Edit', 'pencil', async () => { if (pinned) { navigation.placementId = null; navigation.versionId = null; await persistNavigation(); } await editText(await C.readAsset(asset.id)); }, 'hc-primary')); if (pinned) actions.append(button('Branch this version', 'git-branch', async () => { const result = await C.branchAsset(asset.id, record.version.id); await navigate({ assetId: result.asset.id, placementId: null }); })); }
    else if (asset.kind === 'image' || asset.mime?.startsWith('image/')) { const img = el('img', 'hc-media'); img.alt = asset.name; img.src = objectURL(record.blob); main.append(img); actions.append(button('Crop & resize', 'crop', () => imageTools(record), 'hc-primary'),button('Remove background','scissors',()=>cutoutTools(record))); }
    else if (asset.mime?.startsWith('audio/') || asset.mime?.startsWith('video/')) { main.append(empty('Listen or watch while moving between projects.', button('Open persistent player', 'play', () => openMedia(record)))); actions.append(button('Media tools', 'sliders-horizontal', () => mediaTools(record))); }
    else { main.append(empty(`${record.version.mime} · ${(record.blob.size / 1024).toFixed(1)} KB`, button('Download original', 'download', () => download(record.blob, asset.name)))); }
    if (['image/png','image/jpeg','image/webp'].includes(record.version.mime) || /\.luma$/i.test(asset.name)) actions.append(button(pinned ? 'Open pinned version in Luma' : 'Open in Luma', 'palette', () => openLuma(record), 'hc-primary'));
    if (/\.(glyph(?:\.json)?|lumaglyph\.json)$/i.test(asset.name)) actions.append(button(pinned ? 'Open pinned version in Glyph' : 'Open in Glyph','type',()=>openStudio(record,{},'hole.glyph'),'hc-primary'));
    if (record.blob.type==='application/vnd.hole.captions+json' || /\.captions\.json$/i.test(asset.name)) actions.append(button(pinned?'Edit latest captions':'Review captions','captions',async()=>HoleCaptionEditor.open(await C.readAsset(asset.id),context()),'hc-primary'));
    if (/\.portfolio$/i.test(asset.name)) actions.append(button('Open in Publish Portfolio','layout-template',()=>open('publish',{assetId:asset.id,versionId:pinned?record.version.id:null,placementId:null}),'hc-primary'));
    if (/\.animate$/i.test(asset.name)) actions.append(button('Open in ScenePilot Animation','clapperboard',()=>openStudio(record,{},'hole.animate'),'hc-primary'));
    if (/\.sattari$/i.test(asset.name)) actions.append(button('Open in StemDeck','audio-lines',()=>openStudio(record,{},'hole.stemdeck'),'hc-primary'));
    if (/\.glb$/i.test(asset.name)) actions.append(button('Preview 3D geometry','box',()=>HoleModelPreview.open(record,context())));
    if (/\.ghost$/i.test(asset.name)) actions.append(button('Open in Form Garment','shirt',()=>openStudio(record,{},'hole.ghost'),'hc-primary'));
    if (/\.form$/i.test(asset.name)) actions.append(button('Extract garment source','shirt',()=>HoleGhostAuthoring.extract(record,context())),button(pinned ? 'Open pinned version in Form' : 'Open in Form','box',()=>openStudio(record,{},'hole.form'),'hc-primary'));
    if (/\.(cut|scenepilot\.json)$/i.test(asset.name)) actions.append(button('Open in ScenePilot','film',()=>linkScenePilot(record),'hc-primary'));
    actions.append(button('Carry', 'archive', () => addCarry(asset)), button('History', 'history', () => open('history', { assetId: asset.id })), button('Export', 'download', () => download(record.blob, asset.name))); main.append(actions);
    const drafts = (await C.list('drafts')).filter(d => d.assetId === asset.id); if (drafts.length) { const note = el('div', 'hc-note', 'A durable draft is waiting. The committed version above has not changed.'); note.append(button('Recover draft', 'pencil', async () => /\.portfolio$/i.test(asset.name)?open('publish',{assetId:asset.id,versionId:null,placementId:null}):drafts.some(d=>d.editor==='captions')?HoleCaptionEditor.open(await C.readAsset(asset.id),context()):editText(record))); main.append(note); }
    const refs = (await C.list('placements')).filter(p => p.resourceId === asset.id); const used = section('Used in'); const projects = await C.list('projects'); if (refs.length) refs.forEach(p => { const name = projects.find(q => q.id === p.sceneId)?.name || p.sceneId; used.append(button(`${name} · ${p.policy === 'pinned' ? 'Pinned' : 'Follows latest'}`, 'link', () => navigate({ projectId: p.sceneId, assetId: asset.id, placementId: p.id }))); }); else used.append(el('p', 'hc-subtitle', 'This original is available from Files and Paperwork.'));
  }
  const studios = new Map(), restoredReaderWindows = new Map();
  async function openToolWindow(view,restore={}) {
    const label={day:'Day',paperwork:'Paperwork',bounce:'Bounce',librarian:'Librarian'}[view], origin=document.activeElement;
    const source=view==='librarian'?await C.readAsset(restore.assetId||navigation.assetId,restore.versionId||navigation.versionId||undefined):null;
    const host=el('section','hc-studio-host');host.setAttribute('aria-label',label+' independent window');
    const controls=el('div','hc-row'),root=el('div','hc-studio-content');host.append(controls,root);H.os.append(host);let instance;
    const restoreFocus=()=>{const target=origin?.isConnected&&origin.getClientRects().length?origin:surface.hidden?H.root.querySelector('.hf-desk-stage'):main;target?.focus({preventScroll:true});};
    try {
      instance=await HoleRuntime.open('hole.tool.'+view,{root,instanceId:restore.instanceId,assetId:source?.asset.id,versionId:source?.version.id,projectId:restore.projectId===undefined?navigation.projectId:restore.projectId,spaceId:navigation.spaceId,editorState:restore.editorState||{},presentation:'window'});
      await HoleRuntime.checkpoint(instance.id);
      studios.set(instance.id,{host,name:label+' window',instanceId:instance.id});
      controls.append(el('strong','',label),button('Window layout','move',()=>HoleStudioWindow.layout(host,instance.id,context())),button('Minimize '+label,'minimize-2',async()=>{await HoleRuntime.checkpoint(instance.id);await HoleRuntime.present(instance.id,'minimized');restoreFocus();}),button('Close '+label+' window','x',async()=>{await HoleRuntime.close(instance.id);studios.delete(instance.id);host.remove();restoreFocus();}));
      H.icons();controls.querySelector('button')?.focus({preventScroll:true});
    } catch(error) { if(instance)await HoleRuntime.close(instance.id,{checkpoint:false}).catch(()=>{});host.remove();restoreFocus();throw error; }
    return instance;
  }
  if(window.HoleToolWindows)for(const view of ['day','paperwork','bounce','librarian'])HoleRuntime.register('hole.tool.'+view,HoleStudioWindow.wrap(HoleToolWindows.create({view,context})));
  async function showStudios() { const d = modal('Running studios', 'Editors keep their state while you move through your workspace.'); for (const entry of studios.values()) d.append(button(entry.name, 'palette', async () => { d.close(); await HoleRuntime.present(entry.instanceId,'window'); entry.host.querySelector('button')?.focus(); })); if (!studios.size) d.append(el('p', '', 'Open a PNG or Luma project, then choose Open in Luma.')); d.append(button('Close', 'x', () => d.close())); }
  async function linkScenePilot(record) {
    if (record.blob.size > 32*1024*1024) throw new Error('Connected cuts must fit within 32 MiB.');
    const raw=JSON.parse(await record.blob.text());
    const sources=[...(raw.mainAsset?[{...raw.mainAsset,id:'__main__'}]:[]),...(Array.isArray(raw.assets)?raw.assets:[])];
    if(sources.length>63) throw new Error('This cut has more than 63 media sources. Open it in the full studio.');
    const d=modal('Link ScenePilot media','Select original media already in Files. Each selection grants read access to that exact version. Unlinked media remains missing; native edits can still be saved.');
    const assets=(await C.list('assets')).filter(a=>a.state==='active');const choices=[];
    for(const source of sources){
      const label=el('label','hc-label',String(source.name||source.id));const select=el('select','hc-input');select.setAttribute('aria-label','Media for '+String(source.name||source.id));const missing=el('option','','Leave missing');missing.value='';select.append(missing);
      for(const asset of assets.filter(a=>['image','video','audio'].includes(source.kind)&&a.mime?.startsWith(source.kind+'/'))){const option=el('option','',asset.name);option.value=asset.id;select.append(option);}
      label.append(select);d.append(label);choices.push({source,select});
    }
    d.append(button('Open native cut','film',async()=>{const mediaLinks=[];for(const {source,select} of choices){if(!select.value)continue;const selected=await C.readAsset(select.value);if(source.size!==undefined&&selected.blob.size!==source.size)throw new Error('Selected bytes do not match '+String(source.name||source.id)+'. Choose its original media.');mediaLinks.push({sourceId:String(source.id),assetId:selected.asset.id,versionId:selected.version.id});}d.close();await openStudio(record,{editorState:{mediaLinks}},'hole.scenepilot');}),button('Cancel','x',()=>d.close()));
  }
  async function openLuma(record,restore={}) { return openStudio(record,restore,'hole.luma'); }
  async function openStudio(record, restore = {}, appId = 'hole.luma') {
    const studioName = ({'hole.glyph':'Glyph','hole.form':'Form','hole.scenepilot':'ScenePilot','hole.stemdeck':'StemDeck','hole.ghost':'Form Garment','hole.animate':'ScenePilot Animation'})[appId] || 'Luma';
    if (!window[({'hole.glyph':'HoleGlyph','hole.form':'HoleForm','hole.scenepilot':'HoleScenePilot','hole.stemdeck':'HoleStemDeck','hole.ghost':'HoleGhost','hole.animate':'HoleAnimate'})[appId] || 'HoleLuma']) throw new Error(studioName + ' is unavailable in this build.');
    const key = appId + ':' + record.asset.id + ':' + record.version.id, existing = studios.get(key);
    if (existing) { await HoleRuntime.present(existing.instanceId,'window'); return; }
    if(!restore.skipRecovery&&!restore.instanceId&&!restore.editorState){
      const recoveries=await HoleStudioRecovery.find(C,{appId,assetId:record.asset.id,running:HoleRuntime.list()});
      if(recoveries.length){const d=modal('Studio recovery available',`Unsaved ${studioName} work is retained separately from the saved file. Choose a recovery or open the selected saved version.`);for(const recovery of recoveries){d.append(button('Recover studio draft · '+date(recovery.updatedAt),'history',async()=>{const source=await C.readAsset(record.asset.id,recovery.versionId);d.close();await openStudio(source,{skipRecovery:true,instanceId:recovery.snapshot.id,projectId:recovery.projectId,editorState:{...recovery.snapshot.editorState,assetId:source.asset.id,versionId:source.version.id}},appId);}));}d.append(el('p','','If the saved file changed after this draft, saving will report a version conflict. The draft and newer content remain intact.'),button('Open selected saved version','file',async()=>{d.close();await openStudio(record,{...restore,skipRecovery:true},appId);}),button('Cancel','x',()=>d.close()));return;}
    }
    const host = el('section', 'hc-studio-host'); host.setAttribute('aria-label', studioName + ': ' + record.asset.name); const controls = el('div', 'hc-row'), root = el('div', 'hc-studio-content'); host.append(controls, root); H.os.append(host);
    let instance;
    try {
      instance = await HoleRuntime.open(appId, { ...restore, root, assetId: record.asset.id, versionId: record.version.id, projectId: restore.projectId !== undefined ? restore.projectId : record.asset.projectId || navigation.projectId, presentation: 'window' });
      await HoleRuntime.checkpoint(instance.id);
      studios.set(key, { host, name: record.asset.name, instanceId: instance.id });
      controls.append(el('strong', '', record.asset.name), button('Window layout','move',()=>HoleStudioWindow.layout(host,instance.id,context())), button('Return to workspace', 'minimize-2', async () => { await HoleRuntime.checkpoint(instance.id); await HoleRuntime.present(instance.id,'minimized'); }), button('Close '+studioName, 'x', async () => { await HoleRuntime.close(instance.id); studios.delete(key); host.remove(); await render(); })); H.icons();
    } catch (error) { if(instance)await HoleRuntime.close(instance.id,{checkpoint:false}).catch(()=>{});host.remove(); throw error; }
  }
  if (window.HoleLuma) HoleRuntime.register('hole.luma', HoleStudioWindow.wrap(HoleLuma.create({ core: C })));
  if (window.HoleGlyph) HoleRuntime.register('hole.glyph', HoleStudioWindow.wrap(HoleGlyph.create({ core:C })));
  if (window.HoleStemDeck) HoleRuntime.register('hole.stemdeck',HoleStudioWindow.wrap(HoleStemDeck.create({core:C})));
  if (window.HoleScenePilot) HoleRuntime.register('hole.scenepilot', HoleStudioWindow.wrap(HoleScenePilot.create({core:C})));
  if (window.HoleGhost) HoleRuntime.register('hole.ghost',HoleStudioWindow.wrap(HoleGhost.create({core:C})));
  if (window.HoleAnimate) HoleRuntime.register('hole.animate',HoleStudioWindow.wrap(HoleAnimate.create({core:C})));
  if (window.HoleForm) HoleRuntime.register('hole.form', HoleStudioWindow.wrap(HoleForm.create({core:C})));
  async function editText(record) {
    if (editor && !await finishEditing()) return;
    const draft = (await C.list('drafts')).filter(d => d.assetId === record.asset.id && (!d.editor || d.editor==='text')).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    main.replaceChildren(); breadcrumbs(); title('EDITING · LOCAL DRAFT', record.asset.name, 'Your draft saves as you write. Done creates a version.', [button('Done', 'check', async () => { if (await finishEditing()) await render(); }, 'hc-primary'), button('Export draft', 'download', () => download(new Blob([editor?.input.value || ''], { type: record.version.mime }), record.asset.name))]);
    const box = el('div', 'hc-editor'), area = el('textarea'); area.setAttribute('aria-label', 'Edit ' + record.asset.name); area.value = draft?.text ?? await record.blob.text();
    const foot = el('div', 'hc-editor-status'), label = el('span', 'hc-status', draft ? 'Recovered draft · saved locally' : 'Current version · saved locally'); label.setAttribute('role', 'status'); label.setAttribute('aria-live', 'polite'); foot.append(label, el('span', '', 'Plain text / Markdown')); box.append(area, foot); main.append(box);
    editor = { assetId: record.asset.id, baseVersionId: draft?.baseVersionId || record.version.id, id: draft?.id || uid(), revision: draft?.revision || 0, input: area, label, dirty: !!draft, changed: false, timer: null, pending: Promise.resolve(), failed: false };
    const current = editor; area.addEventListener('input', () => { current.dirty = true; current.changed = true; current.label.textContent = 'Saving draft…'; current.failed = false; clearTimeout(current.timer); current.timer = setTimeout(() => flushDraft(current).catch(() => {}), 220); });
    area.addEventListener('keydown', e => { e.stopPropagation(); if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); flushDraft(current).catch(fail); } });
    area.addEventListener('blur', () => { if (current.dirty) flushDraft(current).catch(() => {}); });
    if (draft?.selection) { area.setSelectionRange(Math.min(area.value.length, draft.selection.start || 0), Math.min(area.value.length, draft.selection.end || 0)); area.scrollTop = draft.scroll || 0; }
    const instance = await HoleRuntime.open('hole.paper-text', { assetId: record.asset.id, versionId: current.baseVersionId, projectId: navigation.projectId, presentation: 'window', reuse: 'never', root: box }); current.instanceId = instance.id; foot.append(button('Focus editor', 'maximize-2', () => HoleRuntime.present(instance.id, 'focus')), button('In canvas', 'panels-top-left', () => HoleRuntime.present(instance.id, 'canvas')), button('Normal size', 'minimize-2', () => HoleRuntime.present(instance.id, 'window')));
    navigation.scope = 'OBJECT_EDIT'; await persistNavigation(); H.icons(); area.focus({ preventScroll: true });
  }
  async function flushDraft(current = editor) {
    if (!current) return; clearTimeout(current.timer);
    current.pending = current.pending.catch(() => {}).then(async () => { if (!current.changed && current.revision) return; const text = current.input.value; const snapshot = { id: current.id, assetId: current.assetId, baseVersionId: current.baseVersionId, editor:'text', text, revision: current.revision, selection: { start: current.input.selectionStart, end: current.input.selectionEnd }, scroll: current.input.scrollTop };
      try { const saved = await C.saveDraft(snapshot); current.revision = saved.revision; current.changed = current.input.value !== text; current.failed = false; current.label.dataset.error = 'false'; current.label.textContent = current.changed ? 'Saving newer changes…' : 'Draft saved locally'; } catch (error) { current.failed = true; current.label.dataset.error = 'true'; current.label.textContent = `${error.message} Your text remains here. Retry or export the draft.`; throw error; }
    }); await current.pending;
    if (current.changed && !current.failed) return flushDraft(current);
    if (current.instanceId) await HoleRuntime.checkpoint(current.instanceId);
  }
  async function finishEditing() { if (!editor) return true; const current = editor; current.input.readOnly = true; try { if (current.dirty) { await flushDraft(current); current.label.textContent = 'Creating version…'; await C.commitDraft(current.id); } if (current.instanceId) await HoleRuntime.close(current.instanceId, { checkpoint: false }); editor = null; navigation.scope = 'OBJECT_PREVIEW'; return true; } catch (error) { current.input.readOnly = false; current.label.textContent = `${error.message} Keep this draft open, retry Done, or export it.`; current.label.dataset.error = 'true'; return false; } }
  async function quickTools(asset, placement) { const d = modal(asset.name, placement?.policy === 'pinned' ? 'This placement uses an approved version.' : 'Tools work on this shared object.'); const row = el('div', 'hc-row'); row.append(button('Carry', 'archive', async () => { await addCarry(asset); d.close(); }), button('History', 'history', async () => { d.close(); await open('history', { assetId: asset.id }); }), button('Download', 'download', async () => { const r = await C.readAsset(asset.id, placement?.policy === 'pinned' ? placement.versionId : undefined); download(r.blob, asset.name); }));
    if (placement) row.append(button(placement.policy === 'pinned' ? 'Follow latest' : 'Pin current version', 'pin', async () => { const current = await C.get('placements', placement.id); await put('placements', { ...current, policy: current.policy === 'pinned' ? 'latest' : 'pinned', versionId: current.policy === 'pinned' ? null : asset.headVersionId }); d.close(); await render(); }));
    row.append(button('Independent copy', 'copy', async () => { const r = await C.readAsset(asset.id); const copy = await C.importAsset({ name: asset.name.replace(/(\.[^.]+)?$/, ' copy$1'), kind: asset.kind, blob: r.blob, projectId: navigation.projectId, provenance: { operation: 'duplicate', sourceAssetId: asset.id, sourceVersionId: r.version.id } }); d.close(); await navigate({ assetId: copy.asset.id, placementId: null }); }), button('Move to Trash', 'trash-2', async () => { await C.trashAsset(asset.id); d.close(); await navigate({ assetId: null }); })); d.append(row, button('Close', 'x', () => d.close())); H.icons(); }

  /* Remaining surfaces share exactly the same object service. */
  async function capture(projectId = navigation.projectId) {
    await C.ready; const d = modal('Catch a thought.', 'Text, links, files, or a voice memo. Choose where this belongs.'); const name = input('Name', 'text', ''), text = input('Thought or link', 'textarea', ''); const dest = el('select', 'hc-input'); const inbox = el('option', '', 'Inbox · no project'); inbox.value = ''; dest.append(inbox); for (const p of await C.list('projects')) { const o = el('option', '', p.name); o.value = p.id; dest.append(o); } dest.value = projectId || ''; const wrap = el('label', 'hc-label', 'Destination'); wrap.append(dest); d.append(name.wrap, text.wrap, wrap);
    const feedback = status('', false, d), row = el('div', 'hc-row'); const add = async (blob, filename, kind, source) => { const p = dest.value ? await C.get('projects', dest.value) : null; const r = await C.importAsset({ name: filename, blob, kind, projectId: p?.id || null, spaceId: p?.spaceId || navigation.spaceId || 'desk', provenance: { capture: true, source: source || 'manual', capturedAt: Date.now() } }); if (p) try { await put('placements', { id: uid(), sceneId: p.id, resourceId: r.asset.id, resourceType: 'asset', policy: 'latest', x: 0, y: 0, depth: 0 }); } catch(error) { notify('Saved '+r.asset.name+' in the project, but its canvas placement could not be added: '+error.message); } feedback.textContent = 'Saved locally: ' + r.asset.name; return r; };
    let captureWriting=false;
    row.append(button('Keep thought', 'check', async () => { if(captureWriting)return;if (!text.input.value.trim()) { text.input.focus(); return; }captureWriting=true;row.querySelectorAll('button').forEach(b=>b.disabled=true);const destination=dest.value;name.input.disabled=true;text.input.disabled=true;dest.disabled=true;try{const value = text.input.value; const link = /^https?:\/\/\S+$/i.test(value.trim()); const r = await add(new Blob([value], { type: 'text/markdown' }), (name.input.value.trim() || (link ? 'Saved link' : 'A new thought')) + '.md', 'text', link ? value.trim() : 'text');await voice.close(); d.close(); await open('projects', { projectId: destination || null, assetId: r.asset.id, placementId: null, scope: 'OBJECT_PREVIEW' });}finally{captureWriting=false;if(d.open){row.querySelectorAll('button').forEach(b=>b.disabled=false);name.input.disabled=false;text.input.disabled=false;dest.disabled=false;}} }, 'hc-primary'));
    const file = el('input'); file.type = 'file'; file.multiple = true; file.hidden = true; file.setAttribute('aria-label', 'Import files into Capture'); d.append(file); file.addEventListener('change', async () => { try { for (const f of file.files) await add(f, f.name, undefined, 'file'); await render(); } catch (error) { feedback.textContent = error.message; feedback.dataset.error = 'true'; } }); row.append(button('Add files', 'upload', () => file.click()));
    let voice;
    const retryVoice=button('Retry saving voice','rotate-cw',()=>voice.retry()),exportVoice=button('Download retained voice','download',()=>{const blob=voice.getBlob();if(!blob)return;download(blob,(name.input.value.trim()||'Voice thought')+(blob.type.includes('mp4')?'.m4a':'.webm'));voice.markExported();});retryVoice.hidden=true;exportVoice.hidden=true;
    const recButton=button('Record voice','mic',async()=>{if(captureWriting)return;if(voice.state().phase==='recording')await voice.stop();else await voice.start();});
    const closeCapture=async()=>{if(captureWriting){feedback.textContent='Waiting for the thought to finish saving.';return;}try{await voice.close();d.close();}catch(error){feedback.textContent=error.message;feedback.dataset.error='true';}};
    const closeButton=button('Close','x',closeCapture);
    voice=HoleVoiceCapture.create({save:blob=>add(blob,(name.input.value.trim()||'Voice thought')+(blob.type.includes('mp4')?'.m4a':'.webm'),'audio','microphone'),onChange:state=>{
      feedback.textContent=state.message;feedback.dataset.error=String(state.phase==='pending');const active=['requesting','recording','stopping','saving','pending'].includes(state.phase);
      name.input.disabled=active;dest.disabled=active;row.querySelectorAll('button').forEach(b=>{if(![recButton,closeButton,retryVoice,exportVoice].includes(b))b.disabled=active;});
      recButton.disabled=!['idle','saved','recording'].includes(state.phase);recButton.querySelector('span').textContent=state.phase==='recording'?'Stop & save':'Record voice';retryVoice.hidden=!state.pending;exportVoice.hidden=!state.pending;retryVoice.disabled=state.phase==='saving';exportVoice.disabled=state.phase==='saving';
    }});row.append(recButton,retryVoice,exportVoice,closeButton);d.append(row);
    const voiceUnload=e=>{const state=voice.state();if(captureWriting||['recording','stopping','saving'].includes(state.phase)||state.pending&&!state.exported){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',voiceUnload);
    d.addEventListener('cancel',e=>{e.preventDefault();closeCapture();});d.addEventListener('close',()=>{window.removeEventListener('beforeunload',voiceUnload);voice.close().catch(fail);});
    d.addEventListener('dragover', e => { e.preventDefault(); }); d.addEventListener('drop', async e => { e.preventDefault(); try { for (const f of e.dataTransfer.files) await add(f, f.name, undefined, 'drop'); } catch (error) { feedback.textContent = error.message; } }); d.addEventListener('paste', async e => { const pasted = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file'); if (!pasted.length) return; e.preventDefault(); try { for (const item of pasted) { const f = item.getAsFile(); await add(f, f.name || 'Pasted image.png', undefined, 'user paste'); } } catch (error) { feedback.textContent = error.message; } }); H.icons(); text.input.focus();
  }
  async function newAnimation(projectId=navigation.projectId) {
    const d=modal('New animation','Create a native ScenePilot animation with editable cels and layers.');const name=input('Animation name','text','Untitled animation'),width=input('Animation width','number','960'),height=input('Animation height','number','540');d.append(name.wrap,width.wrap,height.wrap,button('Create animation','check',async()=>{const file=await HoleAnimate.newDocument({name:name.input.value,width:Number(width.input.value),height:Number(height.input.value)});const saved=await C.importAsset({...file,projectId,provenance:{operation:'animate.create'}});d.close();await open('projects',{assetId:saved.asset.id,versionId:null,placementId:null,projectId});await openStudio(await C.readAsset(saved.asset.id),{},'hole.animate');}),button('Cancel','x',()=>d.close()));
  }
  async function renderCapture() { title('CAPTURE', 'A little room for a thought.', 'Keep a note, link, file, or voice memo. Let it find a project when you are ready.', [button('Capture something', 'plus', () => capture(null), 'hc-primary'),button('New board','layout',()=>HoleMoodboard.create(context())),button('New garment','shirt',()=>HoleGhostAuthoring.create(context()))]); const grid = el('div', 'hc-grid'); for (const a of (await C.list('assets')).filter(a => a.state === 'active' && (!a.projectId || a.provenance?.capture)).sort((a, b) => b.updatedAt - a.updatedAt)) grid.append(await card(a)); main.append(grid); if (!grid.children.length) main.append(empty('Your inbox is quiet. Start with whatever is on your mind.')); }
  async function renderPaperwork() { title('PAPERWORK', 'Everything worth keeping.', 'Your actual documents and material, connected to their originals.', [button('New document', 'file-plus', () => window.HoleEveryday?.newDocument ? HoleEveryday.newDocument(context()) : capture(), 'hc-primary'), button('Open Files', 'folder-open', async () => { await close(); H.openApp('Files'); })]); if (window.HoleEveryday?.paperwork) { await window.HoleEveryday.paperwork(context()); return; } const grid = el('div', 'hc-grid'); main.append(grid); for (const a of (await C.list('assets')).filter(a => a.state === 'active').sort((a, b) => b.updatedAt - a.updatedAt)) grid.append(await card(a)); if (!grid.children.length) grid.append(empty('Import a document or capture a thought to begin.')); }
  async function renderDay() { if (window.HoleEveryday?.day) { await window.HoleEveryday.day(context()); return; } title('DAY', 'Now, next, whenever.', 'Make room for what matters, with a little room left over.', [button('Add a task', 'plus', async () => { const d = modal('A next step.'); const name = input('Task'); d.append(name.wrap, button('Save task', 'check', async () => { if (!name.input.value.trim()) return; await put('tasks', { id: uid(), name: name.input.value.trim(), done: false, projectId: navigation.projectId }); d.close(); await render(); }, 'hc-primary'), button('Cancel', 'x', () => d.close())); })]); const tasks = await C.list('tasks'); for (const task of tasks) { const row = el('div', 'hc-note hc-row'); const check = el('input'); check.type = 'checkbox'; check.checked = !!task.done; check.setAttribute('aria-label', 'Complete ' + task.name); check.addEventListener('change', () => put('tasks', { ...task, done: check.checked }).then(render).catch(fail)); row.append(check, el('span', '', task.name)); main.append(row); } if (!tasks.length) main.append(empty('No tasks waiting. Keep this space as quiet as you like.')); }
  async function addCarry(asset) { if (!(await C.list('carry')).some(r => r.assetId === asset.id && r.versionId === asset.headVersionId)) await put('carry', { id: uid(), assetId: asset.id, versionId: asset.headVersionId, sourceProjectId: navigation.projectId }); await updateCarry(); notify(asset.name + ' is in Carry.'); }
  async function updateCarry() { try { carryBar.querySelector('.hc-carry-count').textContent = String((await C.list('carry')).length); } catch {} }
  async function renderCarry() {
    title('CARRY', 'A pocket between places.', 'Each reference keeps its selected version and original destination.', [button('Keep a snippet', 'file-text', () => { const d = modal('Keep a snippet'); const text = input('Snippet', 'textarea'); d.append(text.wrap, button('Keep', 'check', async () => { if (!text.input.value.trim()) throw new Error('Write a snippet first.'); await put('carry', { id: uid(), kind: 'snippet', text: text.input.value, sourceProjectId: navigation.projectId }); d.close(); await render(); }), button('Cancel', 'x', () => d.close())); })]);
    const records = await C.list('carry'), projects = await C.list('projects');
    for (const item of records) {
      const row = el('section', 'hc-note'); main.append(row);
      let record;
      try { record = await HoleContinuityModel.resolveCarry(C, item); } catch (error) { row.append(el('h2', '', 'Unavailable reference'), el('p', '', error.message)); }
      if (record) {
        row.append(el('h2', '', record.asset?.name || 'Text snippet'));
        if (record.snippet !== undefined) row.append(el('pre', 'hc-preview', record.snippet));
        else if (record.version.mime.startsWith('image/')) { const img = el('img', 'hc-media'); img.alt = record.asset.name; img.src = objectURL(record.blob); row.append(img); }
        else if (/^(audio|video)\//.test(record.version.mime)) { const media = el(record.version.mime.startsWith('audio/') ? 'audio' : 'video', 'hc-media'); media.controls = true; media.src = objectURL(record.blob); row.append(media); }
        else if (record.version.mime.startsWith('text/')) row.append(el('pre', 'hc-preview', (await record.blob.text()).slice(0, 4000)));
        const dest = el('select', 'hc-input'); dest.setAttribute('aria-label', 'Destination project');
        for (const p of projects) { const option = el('option', '', p.name); option.value = p.id; dest.append(option); }
        dest.value = navigation.projectId || projects[0]?.id || '';
        row.append(el('p', '', 'Choose the destination explicitly. The source stays where it is.'), dest, button(record.asset ? 'Link selected version into project' : 'Save snippet into project', 'link', async () => {
          const latest = await C.get('carry', item.id); if (!latest) throw new Error('This reference was removed.'); const selected = await HoleContinuityModel.resolveCarry(C, latest);
          if (!dest.value || !await C.get('projects', dest.value)) throw new Error('Choose an existing project.');
          if (selected.snippet !== undefined) await C.importAsset({ name: 'Carried snippet.txt', blob: new Blob([selected.snippet], { type: 'text/plain' }), projectId: dest.value, provenance: { operation: 'carry-snippet', carryId: item.id, sourceProjectId: item.sourceProjectId } });
          else await put('placements', { id: uid(), sceneId: dest.value, resourceId: selected.asset.id, resourceType: 'asset', policy: 'pinned', versionId: selected.version.id, x: 0, y: 0, depth: 0 });
          notify('Added to the selected project.');
        }));
        if (record.asset) row.append(button('Build a flow with this version', 'workflow', async () => { const latest = await C.get('carry', item.id); if (!latest) throw new Error('Reference removed.'); const selected = await HoleContinuityModel.resolveCarry(C, latest); await recipeDialog([{ assetId: selected.asset.id, versionId: selected.version.id }]); }));
      }
      row.append(button('Remove from Carry', 'x', async () => { await C.deleteRecord('carry', item.id, { expectedRevision: item.revision }); await render(); }));
    }
    if (!records.length) main.append(empty('Use Quick Tools on any material, or keep a snippet here.'));
  }
  async function snapshot() { if (editor) await flushDraft(); const runtime = []; for (const instance of HoleRuntime.list()) runtime.push(await HoleRuntime.serialize(instance.id)); const placements = (await C.list('placements')).filter(p => !navigation.projectId || p.sceneId === navigation.projectId); const project = navigation.projectId ? await C.get('projects', navigation.projectId) : null; await put('snapshots', { id: uid(), name: `${project?.name || 'Workspace'} · ${date(Date.now())}`, projectId: navigation.projectId, navigation: { ...navigation, assetId: null, scope: navigation.projectId ? 'PROJECT' : 'WORLD' }, placements, windows: [...H.windows.values()].map(r => ({ app: r.app.name, space: r.space, x: r.x, y: r.y, w: r.w, h: r.h, minimized: r.minimized })), runtime, deviceLayout: H.state.layout, schemaVersion: 2 }); notify('Arrangement saved. File contents stay independent.'); }
  async function restoreArrangement(snap,{restoreReaderVersions=false}={}) {
    const unavailable = [], recoveryRetained = [], liveRetained = [];
    if (['desktop','pocket'].includes(snap.deviceLayout)) H.setLayout(snap.deviceLayout);
    for (const saved of snap.windows || []) {
      if (!H.byName.has(saved.app)) { unavailable.push(saved.app); continue; }
      if (appViews[saved.app]) continue;
      H.openApp(saved.app); const rec = H.windows.get(saved.app); if (!rec) continue;
      rec.animation?.cancel(); rec.space = saved.space; rec.minimized = !!saved.minimized; rec.el.hidden = rec.minimized;
      if (['x','y','w','h'].every(key => Number.isFinite(saved[key]))) { rec.holeGeometry = { x:saved.x,y:saved.y,w:saved.w,h:saved.h }; window.HoleWindows?.sizeWindow(rec); }
    }
    for (const saved of snap.runtime || []) {
      if (['hole.tool.day','hole.tool.paperwork','hole.tool.bounce','hole.tool.librarian'].includes(saved.appId)) {
        try {
          let instance=HoleRuntime.get(saved.id), source, reopenId=saved.id;
          if(saved.appId==='hole.tool.librarian'&&!instance){
            source=await C.readAsset(saved.context.assetId,restoreReaderVersions?saved.context.versionId:undefined);
            if(!restoreReaderVersions&&source.version.id!==saved.context.versionId){
              const mapped=restoredReaderWindows.get(saved.id), live=mapped&&HoleRuntime.get(mapped);
              if(live?.context.versionId===source.version.id)instance=live;
              reopenId=undefined;
            }
          }
          if(!instance){instance=await openToolWindow(saved.appId.slice('hole.tool.'.length),{instanceId:reopenId,assetId:saved.context?.assetId,versionId:source?.version.id,projectId:saved.context?.projectId,editorState:{hostGeometry:saved.editorState?.hostGeometry}});if(saved.appId==='hole.tool.librarian'&&!reopenId)restoredReaderWindows.set(saved.id,instance.id);}
          const entry=studios.get(instance.id);
          if(entry&&saved.editorState?.hostGeometry)HoleStudioWindow.apply(entry.host,saved.editorState.hostGeometry);
          await HoleRuntime.present(instance.id,saved.presentation==='minimized'?'minimized':'window');
        } catch(error){unavailable.push(saved.appId+': '+error.message);}
        continue;
      }
      if (!saved.context?.assetId) continue;
      try {
        const current = await C.readAsset(saved.context.assetId); if (current.asset.state !== 'active') throw new Error('In Trash');
        if (['hole.luma','hole.glyph','hole.form','hole.scenepilot','hole.stemdeck','hole.animate','hole.ghost'].includes(saved.appId)) {
          // Arrangements restore views. Existing editors and historical recovery have separate lifetimes.
          const candidates = HoleRuntime.list().filter(instance => instance.appId === saved.appId && instance.context.assetId === current.asset.id && instance.status === 'running');
          let instance = candidates.find(instance => instance.id === saved.id) || candidates[0];
          if (instance) liveRetained.push(current.asset.name);
          else {
            const editorState = { hostGeometry: saved.editorState?.hostGeometry };
            if (saved.appId === 'hole.scenepilot' && Array.isArray(saved.editorState?.mediaLinks)) editorState.mediaLinks = saved.editorState.mediaLinks;
            // A new runtime ID avoids implicitly loading bridge-state:<saved.id> into the current head.
            await openStudio(current, { editorState }, saved.appId);
            instance = HoleRuntime.list().find(value => value.appId === saved.appId && value.context.assetId === current.asset.id && value.status === 'running');
          }
          if (!instance) throw new Error('Studio did not open.');
          const entry = [...studios.values()].find(value => value.instanceId === instance.id);
          if (entry && saved.editorState?.hostGeometry) HoleStudioWindow.apply(entry.host, saved.editorState.hostGeometry);
          await HoleRuntime.present(instance.id, saved.presentation === 'minimized' ? 'minimized' : 'window');
          if (saved.editorState?.checkpointId || saved.editorState?.versionId) recoveryRetained.push(current.asset.name);
        }
        else if (saved.appId === 'hole.media') await openMedia(current);
        else if (saved.appId !== 'hole.paper-text') unavailable.push(saved.appId);
      } catch (error) { unavailable.push(saved.appId + ': ' + error.message); }
    }
    H.save(); await navigate({ ...snap.navigation, view:'projects' });
    const report = ['Arrangement restored with current committed content.'];
    if (liveRetained.length) report.push('Live editors and their unsaved work preserved: '+liveRetained.join(', ')+'.');
    if (recoveryRetained.length) report.push('Saved editor recovery was not applied; original checkpoints retained: '+recoveryRetained.join(', ')+'.');
    if (unavailable.length) report.push('Unavailable: '+unavailable.join(', ')+'.');
    notify(report.join(' '));
  }
  async function renderHistory() {
    title('HISTORY · EXPLICIT VIEW', 'A little room to look back.', 'Inspect earlier work. Restoring creates a new version and keeps the record.', [button('Return to live work', 'arrow-left', () => open('projects')), button('Save arrangement', 'bookmark', snapshot)]);
    if (navigation.assetId) {
      const current = await C.readAsset(navigation.assetId); const versions = (await C.list('versions')).filter(v => v.assetId === current.asset.id).sort((a, b) => b.createdAt - a.createdAt);
      const area = section(current.asset.name); for (const v of versions) { const row = el('div', 'hc-note hc-row'); row.append(el('span', '', `${date(v.createdAt)} · ${v.operation || 'Original'}${v.id === current.asset.headVersionId ? ' · Current' : ''}`), button('Inspect version', 'eye', async () => {
        const r = await C.readAsset(current.asset.id, v.id), d = modal('Historical version', `${current.asset.name} · ${date(v.createdAt)} · Read-only`); d.append(el('div', 'hc-history-label', 'HISTORY · This is an earlier saved version.'));
        if (r.version.mime.startsWith('text/')) { const old = await r.blob.text(), live = await current.blob.text(); d.append(el('pre', 'hc-preview', old)); const details = el('details'); details.append(el('summary', '', 'Compare with current version')); const diff = el('table', 'hc-table'); diff.setAttribute('aria-label', 'Line changes from historical to current version'); for (const line of HoleContinuityModel.textDiff(old, live)) { const row = el('tr'); row.dataset.change = line.type; row.append(el('td', '', line.oldLine ?? '—'), el('td', '', line.newLine ?? '—'), el('td', '', line.type), el('td', 'hc-diff-text', line.text)); diff.append(row); } details.append(diff); d.append(details, el('p', '', old === live ? 'The content matches the current version.' : 'The content differs. Inspect both versions before restoring.')); }
        else if (r.version.mime.startsWith('image/')) { const oldImage = el('img', 'hc-media'); oldImage.src = objectURL(r.blob); oldImage.alt = 'Historical ' + r.asset.name; const liveImage = el('img', 'hc-media'); liveImage.src = objectURL(current.blob); liveImage.alt = 'Current ' + r.asset.name; d.append(el('p', '', 'Historical'), oldImage, el('p', '', 'Current'), liveImage); }
        else if (r.version.mime.startsWith('audio/')) { for (const [name, blob] of [['Historical', r.blob], ['Current', current.blob]]) { const player = el('audio', 'hc-media'); player.controls = true; player.src = objectURL(blob); d.append(el('p', '', name), player); } }
        else d.append(button('Download this version', 'download', () => download(r.blob, r.asset.name)));
        d.append(button('Restore as a new current version', 'rotate-ccw', async () => { const latest = await C.readAsset(current.asset.id); await C.commitAsset({ assetId: latest.asset.id, baseVersionId: latest.version.id, blob: r.blob, operation: 'restore', parameters: { restoredVersionId: v.id } }); d.close(); await render(); }, 'hc-primary'), button('Branch into a separate asset', 'git-branch', async () => { const result = await C.branchAsset(current.asset.id, v.id); d.close(); await open('projects', { assetId: result.asset.id, placementId: null }); }), button('Back to live history', 'x', () => d.close())); H.icons();
      })); area.append(row); }
    }
    const snapshots = (await C.list('snapshots')).sort((a, b) => b.createdAt - a.createdAt); const area = section('Saved arrangements');
    for (const snap of snapshots) { const row = el('div', 'hc-note hc-row'); row.append(el('span', '', snap.name), button('Preview arrangement', 'eye', () => {
      const d = modal('Arrangement checkpoint', 'Restore positions and navigation, then reopen supported windows and resources. Current file content and newer work are retained. Playback stays paused.');
      const readerVersions=el('input');readerVersions.type='checkbox';readerVersions.setAttribute('aria-label','Reopen reader windows at saved versions');
      if((snap.runtime||[]).some(r=>r.appId==='hole.tool.librarian')){const label=el('label','hc-label','Reopen reader windows at saved versions');label.append(readerVersions);d.append(label,el('p','','Unchecked: closed readers open current document versions; earlier notes stay with their saved source. Checked: explicitly reopen the saved read-only versions and their window notes. Running readers keep their current source.'));}
      d.append(el('div', 'hc-history-label', `HISTORY · ${date(snap.createdAt)} · ${snap.placements?.length || 0} placements`)); const list = el('ul'); for (const p of snap.placements || []) list.append(el('li', '', `${p.resourceType}: ${p.resourceId.slice(0, 12)} · position ${p.x || 0}, ${p.y || 0} · ${p.policy}`)); d.append(list, button('Restore positions', 'rotate-ccw', async () => { for (const p of snap.placements || []) { const live = await C.get('placements', p.id); if (live) await put('placements', { ...live, x: p.x, y: p.y, depth: p.depth, rotation: p.rotation, scale: p.scale }); } d.close(); await restoreArrangement(snap,{restoreReaderVersions:readerVersions.checked}); }, 'hc-primary'), button('Return to live work', 'x', () => d.close())); H.icons();
    })); area.append(row); } if (!snapshots.length) area.append(empty('Save an arrangement from a project to return to it later.'));
  }
  async function cutoutTools(record){const d=modal('Remove background','Runs the bundled MODNet model locally. Best suited to portraits; inspect the mask because segmentation can be imperfect. Saves a transparent image and a separate alpha mask, retaining your original. Maximum 2048 pixels per edge and 30 MiB.');const feedback=status('',false,d);d.append(button('Create cutout and mask','scissors',()=>runJob('image.cutout',{inputs:[{assetId:record.asset.id,versionId:record.version.id}],projectId:navigation.projectId,parameters:{}},feedback)),button('Close','x',()=>d.close()));}
  async function imageTools(record) {
    if (!window.HoleActions) throw new Error('Image actions are still opening.'); const d = modal('Image tools', 'Create a new version. The original remains in History.'); const w = input('Output width', 'number', '1200'), h = input('Output height', 'number', '1200'); w.input.min = h.input.min = '1'; w.input.max = h.input.max = '8192'; const format = el('select', 'hc-input'); for (const type of ['png', 'webp']) { const o = el('option', '', type.toUpperCase()); o.value = type; format.append(o); } const mode = el('select', 'hc-input'); for (const [value, text] of [['cover', 'Crop to fill'], ['contain', 'Fit inside']]) { const o = el('option', '', text); o.value = value; mode.append(o); } const up = el('label', 'hc-label'); const checkbox = el('input'); checkbox.type = 'checkbox'; up.append(checkbox, el('span', '', 'Allow upscaling if the source is smaller')); const fx = input('Focal point X (0–1)', 'number', '.5'), fy = input('Focal point Y (0–1)', 'number', '.5'); for (const field of [fx.input, fy.input]) { field.min = '0'; field.max = '1'; field.step = '.05'; }
    d.append(w.wrap, h.wrap, el('p', '', 'Framing'), mode, el('p', '', 'Format'), format, fx.wrap, fy.wrap, up); const feedback = status('', false, d); let request;
    let actionId = 'image.crop';
    const previewArea = el('div', 'hc-transform-preview'); d.append(previewArea);
    const create = button('Apply previewed transform', 'check', async () => { if (!request) throw new Error('Preview the transform first.'); create.disabled = true; try { await runJob(actionId, request, feedback); d.close(); await render(); } finally { create.disabled = false; } }, 'hc-primary'); create.disabled = true;
    const reset = () => { request = null; create.disabled = true; }; d.addEventListener('input', reset); d.addEventListener('change', reset);
    d.append(button('Preview transform', 'scan', async () => { actionId = mode.value === 'cover' ? 'image.crop' : 'image.resize'; request = { inputs: [{ assetId: record.asset.id, versionId: record.version.id }], projectId: navigation.projectId, parameters: { width: Number(w.input.value), height: Number(h.input.value), format: format.value, allowUpscale: checkbox.checked } }; if (actionId === 'image.crop') request.parameters.focalPoint = { x: Number(fx.input.value), y: Number(fy.input.value) }; const preview = await HoleActions.preview(actionId, request); await paintOutputPreview(previewArea, record.blob, preview); feedback.textContent = (preview.warnings || []).join(' ') || 'Preview ready. The current version will remain in History.'; create.disabled = !!preview.requiresUpscaleConsent && !checkbox.checked; }), create, button('Cancel', 'x', () => d.close())); H.icons();
  }
  async function mediaTools(record) {
    const video = record.asset.mime.startsWith('video/'); const d = modal(video ? 'Video tools' : 'Audio tools', 'Your browser processes the selected version. Actual outputs save alongside the original. Codec support depends on this browser.'); const feedback = status('', false, d); const request = parameters => ({ inputs: [{ assetId: record.asset.id, versionId: record.version.id }], projectId: navigation.projectId, parameters });
    if (video) { const start=input('Video start (seconds)','number','0'),end=input('Video end (seconds)','number','1');d.append(start.wrap,end.wrap,button('Trim video to WebM','scissors',()=>runJob('video.trim',request({start:Number(start.input.value),end:Number(end.input.value)}),feedback))); const time = input('Thumbnail time (seconds)', 'number', '.75'), width = input('Thumbnail width', 'number', '160'); d.append(time.wrap, width.wrap, button('Create thumbnail', 'image', () => runJob('video.thumbnail', request({ time: Number(time.input.value), width: Number(width.input.value), format: 'png' }), feedback)), button('Extract decodable audio to WAV', 'audio-lines', () => runJob('video.audio', request({}), feedback))); }
    else { d.append(button('Estimate key (experimental)','music',()=>runJob('audio.key',request({maxSeconds:60,budgetMs:10000}),feedback)));d.append(button('Transcribe speech','captions',()=>{d.close();return HoleMediaModels.transcription(record,context(),runJob);}));d.append(button('Separate stems','audio-lines',()=>{d.close();return HoleMediaModels.stems(record,context(),runJob);}));d.append(button('Estimate tempo','activity',()=>runJob('audio.tempo',request({maxSeconds:60,budgetMs:10000}),feedback))); const start = input('Start time (seconds)', 'number', '0'), end = input('End time (seconds)', 'number', '10'); d.append(start.wrap, end.wrap, button('Trim to WAV', 'scissors', () => runJob('audio.trim', request({ start: Number(start.input.value), end: Number(end.input.value) }), feedback)), button('Normalize to WAV', 'audio-lines', () => runJob('audio.normalize', request({}), feedback))); }
    d.append(button('Close', 'x', () => d.close())); H.icons();
  }
  async function runJob(id, request, feedback) { const promise = HoleActions.run(id, request); const cancel = button('Cancel operation', 'x', () => HoleActions.cancel(promise.jobId)); feedback.after(cancel); const onProgress = event => { if (event.detail.jobId === promise.jobId) feedback.textContent = `${event.detail.message || event.detail.status} · ${Math.round(event.detail.progress || 0)}%`; }; window.addEventListener('hole:action-progress', onProgress); try { const result = await promise; feedback.textContent = 'Completed · outputs saved locally'; notify('Completed. Your result is saved in the project.'); return result; } catch (error) { feedback.textContent = error.message; feedback.dataset.error = 'true'; throw error; } finally { window.removeEventListener('hole:action-progress', onProgress); cancel.remove(); } }
  async function renderActions() {
    title('ACTIONS · AVAILABLE THROUGHOUT HOLE', 'Make a useful move.', 'Actions use actual files and preserve their originals.', [button('Release Asset Pack', 'package', releaseDialog, 'hc-primary')]);
    const actions = window.HoleActions?.list() || []; const grid = el('div', 'hc-grid'); for (const action of actions) { const n = el('div', 'hc-card'); n.append(el('strong', '', action.label || action.id), el('small', '', action.description || action.id)); if (action.id !== 'release.asset-pack') n.append(button('Choose material', 'arrow-up-right', () => chooseAction(action))); grid.append(n); } main.append(grid);
    const recipes = section('Your reusable flows'); recipes.append(button('Create a flow', 'plus', recipeDialog)); for (const recipe of await C.list('recipes')) { const row = el('div', 'hc-note hc-row'); row.append(el('span', '', recipe.name || recipe.label || recipe.id), button('Preview & run', 'play', () => runRecipeDialog(recipe))); recipes.append(row); }
    const runs = section('Recent flow runs'); for (const run of (await C.list('runs')).filter(run => run.recipeSnapshot).sort((a,b) => b.createdAt - a.createdAt).slice(0,30)) runs.append(button((run.recipeName || run.recipeId || 'Flow') + ' · ' + run.status, 'history', async () => { const d = modal('Flow run', 'Inspect durable steps and outputs.'); await HoleFlowUI.mountRun(d, run.id, flowOptions()); d.append(button('Close', 'x', () => d.close())); }));
    const activity = section('Actual activity'); for (const job of (await C.list('jobs')).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20)) { const row = el('div', 'hc-note'); row.append(el('strong', '', job.label || job.actionId || job.name || job.kind || 'Operation'), el('p', 'hc-subtitle', `${job.status} · ${job.error?.message || job.message || job.step || ''}`)); const progress = el('progress', 'hc-progress'); progress.max = 100; progress.value = job.progress || 0; progress.setAttribute('aria-label', 'Operation progress'); row.append(progress); if (['running', 'queued'].includes(job.status)) row.append(button('Cancel', 'x', () => HoleActions.cancel(job.id).then(render))); if (['failed', 'interrupted', 'cancelled'].includes(job.status) && job.actionId) row.append(button('Retry', 'rotate-cw', () => HoleActions.retry(job.id).then(render))); activity.append(row); }
  }
  async function chooseAction(action) {
    const d = modal('Choose material', action.label || action.id);
    const prefix = action.id.split('.')[0];
    const matches = (await C.list('assets')).filter(a => a.state === 'active' && (prefix === 'image' ? a.mime.startsWith('image/') : prefix === 'audio' ? a.mime.startsWith('audio/') : prefix === 'video' ? a.mime.startsWith('video/') : a.mime.startsWith('text/')));
    for (const a of matches) d.append(button(a.name, kindIcon(a), async () => { d.close(); const r = await C.readAsset(a.id); if (prefix === 'image') await imageTools(r); else if (prefix === 'audio' || prefix === 'video') await mediaTools(r); else if (action.id === 'text.branch') { const result = await C.branchAsset(a.id, r.version.id); await open('projects', { assetId: result.asset.id, placementId: null }); } else { await open('projects', { assetId: a.id, placementId: null }); await editText(r); } }));
    if (!matches.length) d.append(empty('No matching material yet. Import a file with Capture.'));
    d.append(button('Close', 'x', () => d.close())); H.icons();
  }
  async function paintOutputPreview(target, blob, preview) {
    target.replaceChildren(); const image = await createImageBitmap(blob);
    try { for (const output of preview.outputs || []) { if (!output.geometry) continue; const g = output.geometry, factor = Math.min(1, 240 / Math.max(output.width, output.height)); const figure = el('figure'); const canvas = el('canvas'); canvas.width = Math.max(1, Math.round(output.width * factor)); canvas.height = Math.max(1, Math.round(output.height * factor)); canvas.setAttribute('aria-label', `${output.role}: ${output.width} by ${output.height} preview`); canvas.getContext('2d').drawImage(image, g.x, g.y, g.width, g.height, 0, 0, canvas.width, canvas.height); figure.append(canvas, el('figcaption', '', `${output.role} · ${output.width} × ${output.height}`)); target.append(figure); } } finally { image.close(); }
  }
  function flowOptions(inputs = []) { const leaveDialog = () => H.os.querySelector('.hc-dialog[open]')?.close(); return { inputs, projectId: navigation.projectId, onOpen: async ref => { leaveDialog(); await open('projects', { assetId: ref.assetId, versionId: ref.versionId, placementId: null }); }, onCarry: async ref => { const record = await C.readAsset(ref.assetId, ref.versionId); await addCarry({ ...record.asset, headVersionId: record.version.id }); }, onPublish: async ref => { leaveDialog(); await open('publish', { assetId: ref.assetId, versionId: ref.versionId, placementId: null }); } }; }
  async function recipeDialog(inputs = []) { const d = modal('Build a flow', 'Compose registered actions, then review the selected versions before running.'); await HoleFlowUI.mount(d, flowOptions(Array.isArray(inputs) ? inputs : [])); d.append(button('Close', 'x', () => d.close())); H.icons(); }
  async function runRecipeDialog(recipe) { const d = modal('Review flow', recipe.name); await HoleFlowUI.mount(d, { ...flowOptions(), recipe }); d.append(button('Close', 'x', () => d.close())); H.icons(); }
  async function releaseDialog() {
    const d = modal('Release Asset Pack', 'Approve the cover and framing. Generate three real sizes, plus a ZIP with a version manifest.'); const select = el('select', 'hc-input'); select.setAttribute('aria-label', 'Approved cover image'); for (const a of (await C.list('assets')).filter(a => a.state === 'active' && a.mime.startsWith('image/'))) { const o = el('option', '', a.name); o.value = a.id; select.append(o); } const fx = input('Focal point X (0–1)', 'number', '.5'), fy = input('Focal point Y (0–1)', 'number', '.5'); for (const n of [fx.input, fy.input]) { n.min = '0'; n.max = '1'; n.step = '.05'; } const label = el('label', 'hc-label'), upscale = el('input'); upscale.type = 'checkbox'; label.append(upscale, el('span', '', 'Allow upscaling of smaller images')); d.append(select, el('p', '', '3000 × 3000 cover · 1080 × 1920 story · 1200 × 630 preview. Cropped around your chosen focal point, never stretched.'), fx.wrap, fy.wrap, label); const feedback = status('', false, d); const previewArea = el('div', 'hc-transform-preview'); d.append(previewArea); let request; const run = button('Generate approved pack', 'package', async () => { if (!request) return; run.disabled = true; const result = await runJob('release.asset-pack', request, feedback); for (const out of result.outputs || []) { if (!out.asset) continue; const r = await C.readAsset(out.asset.id); if (r.version.mime.startsWith('image/')) { const img = el('img', 'hc-media'); img.alt = out.asset.name; img.src = objectURL(r.blob); d.append(img); } d.append(button('Download ' + out.asset.name, 'download', () => download(r.blob, out.asset.name))); } H.icons(); }, 'hc-primary'); run.disabled = true;
    d.addEventListener('input', () => { run.disabled = true; request = null; }); d.addEventListener('change', () => { run.disabled = true; request = null; });
    d.append(button('Preview outputs', 'scan', async () => { const r = await C.readAsset(select.value); request = { inputs: [{ assetId: r.asset.id, versionId: r.version.id }], projectId: navigation.projectId, parameters: { focalPoint: { x: Number(fx.input.value), y: Number(fy.input.value) }, allowUpscale: upscale.checked, format: 'png' } }; const preview = await HoleActions.preview('release.asset-pack', request); await paintOutputPreview(previewArea, r.blob, preview); feedback.textContent = (preview.warnings || []).join(' ') || 'Framing approved for all three sizes. Originals are retained.'; run.disabled = !!preview.requiresUpscaleConsent && !upscale.checked; }), run, button('Close', 'x', () => d.close())); H.icons();
  }
  async function renderPublish() {
    const selected = navigation.assetId ? await C.readAsset(navigation.assetId,navigation.versionId || undefined) : null;
    const selectedPortfolio = selected && /\.portfolio$/i.test(selected.asset.name);
    title('PUBLISH', 'Ready when you are.', 'Prepare selected versions for export. A local package is not a public publication.', [button('Prepare a release pack', 'package', releaseDialog, 'hc-primary')]);
    if (selected && navigation.versionId) {
      const selectedArea = section(selectedPortfolio ? 'Selected portfolio version' : 'Selected Flow output');
      selectedArea.append(el('p','',selected.asset.name+' · approved version '+selected.version.id),button('Export selected version','download',()=>download(selected.blob,selected.asset.name)));
      if (selected.version.mime.startsWith('image/')) { const img=el('img','hc-media');img.alt=selected.asset.name;img.src=objectURL(selected.blob);selectedArea.append(img); }
    }
    if(window.HolePressKit)pressKitSession=await HolePressKit.mount(section('Press materials'),{core:C,projectId:navigation.projectId,onOpen:ref=>open('projects',{assetId:ref.assetId,versionId:ref.versionId,placementId:null})});
    const supportedMedia = ['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm'];
    const inputs = selected && navigation.versionId && supportedMedia.includes(selected.version.mime) ? [{assetId:selected.asset.id,versionId:selected.version.id}] : [];
    portfolioSession=await HolePortfolio.mount(section('Portfolio websites'),{core:C,projectId:navigation.projectId,inputs,onOpen:ref=>open('projects',{...ref,placementId:null})});
    if(selectedPortfolio)await portfolioSession.open(selected.asset.id,navigation.versionId);
    const grid = el('div', 'hc-grid');
    for (const a of (await C.list('assets')).filter(a => a.state === 'active' && (a.mime === 'application/zip' || a.provenance?.actionId === 'release.asset-pack'))) grid.append(await card(a));
    main.append(grid);
    if (!grid.children.length) main.append(empty('Your exported collections will live here.'));
    main.append(el('div', 'hc-note', 'Public Worlds and hosted publishing require the authorized sharing service. Files stay private until you deliberately export or publish them.'));
  }

  async function renderStorage() {
    title('STORAGE & RECOVERY', 'Keep your world safe.', 'A full backup contains your private files, drafts, versions, projects, and arrangements. Setup exports remain layout-only.');
    const estimate = await navigator.storage?.estimate?.(); if (estimate) main.append(el('p', 'hc-subtitle', `Browser storage: ${(estimate.usage / 1048576).toFixed(1)} MB used of approximately ${(estimate.quota / 1048576).toFixed(0)} MB available.`));
    const row = el('div', 'hc-row'); row.append(button('Export full private backup', 'download', async () => { const blob = await C.exportBackup(); download(blob, `hole-private-backup-${new Date().toISOString().slice(0, 10)}.json`); notify('Full backup prepared. Keep your downloaded copy somewhere private.'); }, 'hc-primary'));
    const file = el('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true; file.setAttribute('aria-label', 'Choose a full Hole backup'); main.append(file); row.append(button('Validate & restore backup', 'upload', () => file.click()));
    file.onchange = async () => {
      try {
        const blob = file.files[0]; file.value = ''; if (!blob) return;
        const report = await C.validateBackup(blob), plan = report.restorePlan || {}, d = modal('Restore a private backup', 'The archive is validated before writing. Personal work conflicts stop the restore. Current device identity and visit location are kept.');
        d.append(el('p', '', `${report.assets} assets · ${report.versions} versions · ${report.drafts} drafts`));
        if (plan.retainedSettings?.length || plan.omittedSettings?.length) d.append(el('p', 'hc-subtitle', 'This browser keeps its current visit location and configured connection settings where present. A source device identity is never reused. Archive settings remain in the restore journal.'));
        const approve = el('input'); approve.type = 'checkbox';
        if (plan.requiresBootstrapApproval) {
          const label = el('label', 'hc-label'); label.append(approve, el('span', '', 'Replace this untouched starter desktop with the backup’s desktop, notes, and arrangements. The initial settings are preserved in the restore journal.')); d.append(label);
        }
        if (plan.conflicts?.length) d.append(el('p', 'hc-status', `${plan.conflicts.length} conflict(s) with personal work. Nothing will be replaced. First conflict: ${plan.conflicts[0].store}/${plan.conflicts[0].id}. Use a separate profile with no personal work to retain both copies.`));
        const restore = button('Restore validated backup', 'upload', async () => {
          await window.HolePersistence?.flush?.();
          await C.restoreBackup(blob, { replaceBootstrapSettings: approve.checked });
          d.close(); notify('Backup restored and verified. Current device settings are retained.'); await render();
        }, 'hc-primary');
        const updateReview = () => { restore.disabled = !!plan.conflicts?.length || !!plan.requiresBootstrapApproval && !approve.checked; }; approve.addEventListener('change', updateReview); updateReview();
        d.append(restore, button('Cancel', 'x', () => d.close())); H.icons();
      } catch (error) { fail(error); }
    };
    main.append(row); const trash = section('Recoverable Trash'); const items = (await C.list('assets')).filter(a => a.state === 'trashed'); for (const a of items) { const n = el('div', 'hc-note hc-row'); n.append(el('span', '', a.name), button('Restore', 'rotate-ccw', async () => { await C.restoreAsset(a.id); await render(); })); trash.append(n); } if (!items.length) trash.append(el('p', 'hc-subtitle', 'Trash is empty. Removing a placement never deletes its file.'));
    const drafts = section('Durable drafts'); for (const d of await C.list('drafts')) { const a = await C.get('assets', d.assetId); drafts.append(button('Recover ' + (a?.name || d.assetId), 'file-pen', async () => { await open('projects', { assetId: d.assetId, placementId: null }); const recovered=await C.readAsset(d.assetId); if(d.editor==='captions')await HoleCaptionEditor.open(recovered,context());else await editText(recovered); })); }
  }
  async function saveInstrument() { const d = modal('Save this arrangement', 'A reusable instrument keeps references and tools. It does not copy your files.'); const name = input('Instrument name', 'text', 'My project view'); d.append(name.wrap, button('Save instrument', 'bookmark', async () => { await put('instruments', { id: uid(), name: name.input.value.trim() || 'My project view', navigation: { ...navigation, assetId: null }, projectId: navigation.projectId }); d.close(); notify('Instrument saved in Create.'); }, 'hc-primary'), button('Cancel', 'x', () => d.close())); H.icons(); }
  async function renderInstruments() { main.append(button('Save this view', 'bookmark', saveInstrument)); const grid = el('div', 'hc-grid'); for (const item of await C.list('instruments')) { const b = el('button', 'hc-card'); b.append(el('strong', '', item.name), el('small', '', 'Saved project arrangement')); b.onclick = () => navigate(item.navigation).catch(fail); grid.append(b); } main.append(grid); }
  function renderCatalog() { title('CATALOG', 'Know what is ready.', 'Installed tools and external handoffs stay distinct from future capabilities.'); const table = el('table', 'hc-table'); const head = el('thead'), hr = el('tr'); ['App', 'Availability', 'What it does'].forEach(s => hr.append(el('th', '', s))); head.append(hr); table.append(head); const body = el('tbody'); for (const a of window.HoleCapabilities.list()) { const row = el('tr'); row.append(el('td', '', a.name), el('td', '', a.label), el('td', '', a.description)); body.append(row); } table.append(body); main.append(table); }
  async function showSearch() {
    await C.ready; const d = modal('Where do you want to go?', 'Find places, projects, objects, commands, and saved history.'); const field = input('Search', 'search'), results = el('div', 'hc-search-results');
    const assets = (await C.list('assets')).filter(a => a.state === 'active'), projects = await C.list('projects'), snapshots = await C.list('snapshots');
    const spaces = [{id:'desk',name:'My desk'},{id:'studio',name:'Studio'},{id:'life',name:'Life'},...(H.state.projects || [])];
    const items = [
      ...assets.map(a => ({ name:a.name, kind:'Object', go:() => open('projects',{assetId:a.id,versionId:null,projectId:a.projectId || null,placementId:null,scope:'OBJECT_PREVIEW'}) })),
      ...projects.map(p => ({name:p.name,kind:'Project',go:() => open('projects',{projectId:p.id,spaceId:p.spaceId,assetId:null,scope:'PROJECT'})})),
      ...spaces.map(p => ({name:p.name,kind:'Space',go:() => open('projects',{spaceId:p.id,projectId:null,assetId:null,scope:'SPACE'})})),
      ...snapshots.map(p => ({name:p.name,kind:'Saved arrangement',go:() => open('history',{projectId:p.projectId || null,assetId:null})})),
      ...entries.map(([view,name]) => ({name,kind:'Command',go:() => open(view,{assetId:null})}))
    ];
    let contentController,searchEpoch=0;
    const contentResults=el('div','hc-search-results'), feedback=status('',false,d);
    const historyLabel=el('label','hc-label'),includeHistory=el('input');includeHistory.type='checkbox';historyLabel.append(includeHistory,el('span','','Include earlier text versions'));
    const projectScope=navigation.projectId;const scopeLabel=el('label','hc-label'),onlyProject=el('input');onlyProject.type='checkbox';scopeLabel.append(onlyProject,el('span','','Search text in this project and its linked materials'));scopeLabel.hidden=!projectScope;
    const draftLabel=el('label','hc-label'),includeDrafts=el('input');includeDrafts.type='checkbox';draftLabel.append(includeDrafts,el('span','','Include recovery draft text'));
    const invalidate=()=>{searchEpoch++;contentController?.abort();contentResults.replaceChildren();feedback.textContent='';};
    const paint = () => { invalidate();results.replaceChildren(); const q = field.input.value.toLocaleLowerCase().trim(); const matches = items.filter(item => (item.name+' '+item.kind).toLocaleLowerCase().includes(q)).slice(0,60); for (const item of matches) results.append(button(item.name+' · '+item.kind,'arrow-up-right',async () => {d.close();await item.go();})); if (!matches.length) results.append(el('p','','No matching names. Try Search local text.')); H.icons(); };
    const contentButton=button('Search local text','file-search',async()=>{
      invalidate();const epoch=searchEpoch;contentController=new AbortController();feedback.textContent='Searching local text…';
      try{const found=await HoleContentSearch.search(C,field.input.value,{history:includeHistory.checked,drafts:includeDrafts.checked,projectId:onlyProject.checked?projectScope:undefined,signal:contentController.signal});if(epoch!==searchEpoch||!d.open)return;
        feedback.textContent=`Searched ${found.scanned} documents. ${found.skipped} unreadable or oversized documents skipped.${found.limited?' Search limit reached; narrow the query.':''} Text/JSON only; images, PDF text and studio binaries are not indexed.`;
        for(const match of found.matches){const row=el('div','hc-note');row.append(el('p','',match.snippet),button(match.name+' · '+match.kind,'file-search',async()=>{d.close();if(match.draftId){const saved=await C.get('drafts',match.draftId);if(!saved)throw Error('This recovery draft has already been saved or removed.');await open('projects',{assetId:match.assetId,versionId:null,placementId:null,projectId:match.projectId});const current=await C.readAsset(match.assetId);if(saved.editor==='captions')await HoleCaptionEditor.open(current,context());else if(saved.editor==='text'||!saved.editor&&current.version.mime.startsWith('text/'))await editText(current);else notify('Open the matching editor to recover this draft.');}else await open('projects',{assetId:match.assetId,versionId:match.kind==='Historical text'?match.versionId:null,placementId:null,projectId:match.projectId});}));contentResults.append(row);}if(!found.matches.length)contentResults.append(el('p','','No matching text in the searched documents.'));H.icons();
      }catch(error){if(error.name!=='AbortError'&&epoch===searchEpoch)feedback.textContent=error.message;}
    });
    includeHistory.onchange=invalidate;includeDrafts.onchange=invalidate;onlyProject.onchange=invalidate;d.addEventListener('close',invalidate);field.input.oninput=paint;d.append(field.wrap,results,historyLabel,draftLabel,scopeLabel,contentButton,contentResults,button('Close','x',()=>d.close()));paint();field.input.focus();
  }
  function readRoute() { const parts = location.hash.split('/'); if (parts[1] !== 'work' || parts.length < 6) return null; try { const [view, spaceId, projectId, assetId] = parts.slice(2, 6).map(decodeURIComponent).map(s => s === '-' ? null : s); if (!entries.some(e => e[0] === view) && !['weblab','lab','crew','momentous','atlas','tongue'].includes(view)) return null; return { view, spaceId, projectId, assetId, placementId: null, scope: assetId ? 'OBJECT_PREVIEW' : projectId ? 'PROJECT' : spaceId && spaceId !== 'overview' ? 'SPACE' : 'WORLD' }; } catch { return null; } }
  window.addEventListener('popstate', event => { const next = event.state?.hole ? event.state.navigation : readRoute(); if (!next) { close().catch(fail); return; } surface.hidden = false; navigate(next, { fromHistory: true }).catch(fail); });
  surface.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Escape' && !event.target.closest('textarea,input,[contenteditable]')) { event.preventDefault(); if (navigation.assetId) navigate({ assetId: null }).catch(fail); else close().catch(fail); } });
  window.addEventListener('hole:storage-status', event => { if (['failed', 'conflict', 'blocked'].includes(event.detail.state)) notify(event.detail.message || 'Storage could not save that change. Keep your work open and export a copy.'); });
  H.root.addEventListener('hole:space-change', event => { if (!surface.hidden && !editor && navigation.view === 'projects') navigate({ spaceId: event.detail.space, scope: event.detail.space === 'overview' ? 'WORLD' : 'SPACE', projectId: null, assetId: null }).catch(fail); });
  const appViews = { Projects: 'projects', Day: 'day', Capture: 'capture', Paperwork: 'paperwork', Actions: 'actions', History: 'history', Create: 'create', Publish: 'publish', Bounce:'bounce', Librarian:'librarian', WebLab: 'weblab', Lab: 'lab', Atlas: 'atlas', Tongue: 'tongue', Crew: 'crew', Momentous: 'momentous', Relay: 'relay', Rack: 'rack' };
  H.root.addEventListener('hole:window-change', event => { const { type, rec } = event.detail || {}; if (type !== 'open' || !appViews[rec?.app.name]) return; rec.el.hidden = true; rec.minimized = true; open(appViews[rec.app.name]).catch(fail); });
  HoleRuntime.register('hole.paper-text', { mount(instance, root) {
    const area = root.querySelector('textarea');
    return { serialize: () => ({ assetId: instance.context.assetId, text: area.value, selection: { start: area.selectionStart, end: area.selectionEnd }, scroll: area.scrollTop }), present: mode => { root.dataset.mode = mode; area.focus({ preventScroll: true }); } };
  } });
  const mediaShelf = el('aside', 'hc-player'); mediaShelf.hidden = true; mediaShelf.setAttribute('aria-label', 'Persistent media player'); H.field.append(mediaShelf);
  let mediaSession = null;
  HoleRuntime.register('hole.media', { mount(instance, root) { const player = root.querySelector('audio,video'); return { serialize: () => ({ currentTime: player.currentTime, volume: player.volume, paused: player.paused }), present: mode => { root.dataset.mode = mode; }, close: () => { player.dataset.closing = 'true'; player.pause(); player.removeAttribute('src'); player.load(); } }; } });
  async function openMedia(record) {
    if (mediaSession?.versionId === record.version.id) { mediaShelf.hidden = false; return; }
    if (mediaSession) { await HoleRuntime.close(mediaSession.id); URL.revokeObjectURL(mediaSession.url); }
    const url = URL.createObjectURL(record.blob); const player = el(record.asset.mime.startsWith('audio/') ? 'audio' : 'video'); player.controls = true; player.src = url;
    mediaShelf.replaceChildren(el('strong', '', record.asset.name), player); mediaShelf.hidden = false;
    const instance = await HoleRuntime.open('hole.media', { assetId: record.asset.id, versionId: record.version.id, projectId: navigation.projectId, root: mediaShelf, presentation: 'window' }); mediaSession = { id: instance.id, versionId: record.version.id, url };
    const saved = (await C.list('settings')).filter(s => s.id.startsWith('runtime:') && s.value?.appId === 'hole.media' && s.value?.context?.versionId === record.version.id).sort((a,b) => b.updatedAt - a.updatedAt)[0];
    if (saved) player.addEventListener('loadedmetadata', () => { player.currentTime = Math.min(player.duration || 0, saved.value.editorState.currentTime || 0); player.volume = saved.value.editorState.volume ?? 1; }, { once: true });
    player.addEventListener('pause', () => { if (!player.dataset.closing && HoleRuntime.get(instance.id)) HoleRuntime.checkpoint(instance.id).catch(fail); });
    mediaShelf.append(button('Stop & close', 'x', async () => { await HoleRuntime.close(instance.id); URL.revokeObjectURL(url); mediaSession = null; mediaShelf.hidden = true; mediaShelf.replaceChildren(); })); H.icons();
  }
  window.HoleContinuity = { open, close, capture, showSearch, navigate, render, context, snapshot, get navigation() { return { ...navigation }; }, get editing() { return !!editor; }, finishEditing };
  C.ready.then(async () => { navRecord = await C.get('settings', 'navigation'); if (navRecord?.value) navigation = { ...navigation, ...navRecord.value, scope: navRecord.value.assetId ? 'OBJECT_PREVIEW' : navRecord.value.scope }; const route = readRoute(); if (route) navigation = { ...navigation, ...route }; projectNames = new Map((await C.list('projects')).map(p => [p.id, p.name])); await updateCarry(); await window.HoleActions?.recover?.(); restored = true; H.icons(); if ((route || navRecord?.value) && !window.HoleWelcome?.preferences.startHere) { surface.hidden = false; H.os.classList.add('hc-active'); await render(); } }).catch(fail);
})();
