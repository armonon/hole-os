/* Hole's public front door and browser-local controls. Loaded after the OS shell. */
(() => {
  const H = window.HoleOS;
  if (!H || window.HoleWelcome) return;
  const { root, os } = H;
  const storageKey = 'hole.welcome.v1';
  const defaults = { quiet: false, focus: false, stories: true, startHere: true, theme: 'auto' };
  let prefs = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    for (const key of ['quiet', 'focus', 'stories', 'startHere']) if (typeof saved[key] === 'boolean') prefs[key] = saved[key];
    if (['auto', 'light', 'dark'].includes(saved.theme)) prefs.theme = saved.theme;
  } catch { /* An unavailable browser store does not prevent entry. */ }
  const names = { desk: 'My desk', studio: 'Studio', life: 'Life' };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let welcomeBackground = null, controlBackground = null, welcomeReturn = null, controlReturn = null;
  let welcomeEpoch = 0, controlEpoch = 0, toastTimer = 0, storyIndex = 0;
  const icon = (name) => '<i data-lucide="' + name + '" aria-hidden="true"></i>';
  const welcome = document.createElement('section');
  welcome.className = 'hw-welcome';
  welcome.hidden = true; welcome.inert = true;
  welcome.setAttribute('role', 'dialog'); welcome.setAttribute('aria-modal', 'true');
  welcome.setAttribute('aria-labelledby', 'hw-welcome-title');
  welcome.innerHTML = `
    <div class="hw-welcome-scroll">
      <header class="hw-welcome-header">
        <div class="hw-wordmark" aria-label="Hole by thecreatingco">h<span>◎</span>le<b>.</b><small>by thecreatingco.</small></div>
        <div class="hw-header-actions"><button type="button" class="hw-icon-button" data-hw="controls" aria-label="Open Control Center">${icon('sliders-horizontal')}</button><button type="button" class="hw-icon-button" data-hw="enter" aria-label="Enter your spaces">${icon('arrow-up-right')}</button></div>
      </header>
      <div class="hw-welcome-content">
        <div class="hw-hero">
          <div class="hw-arrival hw-rise">
            <div class="hw-eyebrow">A LITTLE ROOM FOR YOU</div>
            <time class="hw-clock"></time><div class="hw-date"></div>
            <h1 id="hw-welcome-title">Make yourself<br>at home.</h1>
            <p>Your ideas, your tools, your own little world.</p>
            <button type="button" class="hw-enter" data-hw="enter">Enter your spaces ${icon('arrow-up-right')}</button>
          </div>
          <div class="hw-space-collection hw-rise" aria-label="Enter a desktop space">
            <div class="hw-orbit-ring" aria-hidden="true"></div>
            <button type="button" class="hw-space hw-space-studio" data-hw-space="studio"><span class="hw-planet"><span class="hw-mini-type" aria-hidden="true">Aa</span><span class="hw-mini-art" aria-hidden="true"></span><span class="hw-mini-orb" aria-hidden="true">${icon('box')}</span></span><strong>Studio</strong><small>Make something yours</small></button>
            <button type="button" class="hw-space hw-space-desk" data-hw-space="desk"><span class="hw-planet"><span class="hw-mini-note" aria-hidden="true">${icon('notebook-pen')}</span><span class="hw-mini-art" aria-hidden="true"></span><span class="hw-mini-orb" aria-hidden="true">${icon('folder')}</span></span><strong>My desk</strong><small>Your everyday space</small></button>
            <button type="button" class="hw-space hw-space-life" data-hw-space="life"><span class="hw-planet"><span class="hw-mini-book" aria-hidden="true">${icon('book-open')}</span><span class="hw-mini-orb" aria-hidden="true">${icon('leaf')}</span><span class="hw-mini-time" aria-hidden="true">12</span></span><strong>Life</strong><small>Keep what matters close</small></button>
            <span class="hw-space-caption">Three places. Endless possibilities.</span>
          </div>
        </div>
        <div class="hw-widget-grid">
          <article class="hw-card hw-quick-card hw-rise">
            <div class="hw-card-head"><span class="hw-eyebrow">MAKE A LITTLE SOMETHING</span>${icon('sparkles')}</div>
            <h2>Start with an idea.</h2>
            <div class="hw-quick-tools">
              <button type="button" data-hw-app="Notes"><span class="hw-tool-note">${icon('notebook-pen')}</span>Write</button>
              <button type="button" data-hw-app="Luma"><span class="hw-tool-create">${icon('paintbrush')}</span>Create</button>
              <button type="button" data-hw-app="Converter"><span class="hw-tool-convert">${icon('repeat-2')}</span>Convert</button>
              <button type="button" data-hw="files"><span class="hw-tool-files">${icon('folder-open')}</span>Files</button>
            </div>
            <div class="hw-card-foot">A shortcut to your next good thought.</div>
          </article>
          <article class="hw-card hw-recent-card hw-rise">
            <div class="hw-card-head"><span class="hw-eyebrow">CLOSE AT HAND</span><button type="button" class="hw-text-button" data-hw="files">All files ${icon('arrow-up-right')}</button></div>
            <h2>Pick up a thread.</h2><div class="hw-recents"></div>
            <div class="hw-job-widget" hidden></div>
          </article>
          <article class="hw-card hw-story-card hw-rise">
            <div class="hw-card-head"><span class="hw-eyebrow">DISCOVER CREATING CO</span><button type="button" class="hw-icon-button hw-dismiss" data-hw="dismiss-story" aria-label="Hide product stories">${icon('x')}</button></div>
            <div class="hw-story-copy"></div><div class="hw-story-art" aria-hidden="true"></div>
            <div class="hw-story-bottom"><button type="button" class="hw-text-button hw-story-open"></button><button type="button" class="hw-icon-button" data-hw="next-story" aria-label="Next product story">${icon('arrow-right')}</button></div>
            <div class="hw-editorial-label">Product story · from the Creating Co ecosystem</div>
          </article>
        </div>
        <footer class="hw-welcome-footer"><span>${icon('hard-drive')} Saved in this browser</span><label><input type="checkbox" data-hw-pref="startHere"> Start here next time</label><a href="https://thecreatingco.com/" target="_blank" rel="noopener noreferrer">Meet thecreatingco. ${icon('arrow-up-right')}</a></footer>
      </div>
    </div>`;
  const controls = document.createElement('section');
  controls.className = 'hw-control-overlay'; controls.hidden = true; controls.inert = true;
  controls.setAttribute('role', 'dialog'); controls.setAttribute('aria-modal', 'true'); controls.setAttribute('aria-labelledby', 'hw-control-title');
  controls.innerHTML = `
    <div class="hw-control-panel">
      <header class="hw-control-heading"><div><span class="hw-eyebrow">JUST THE WAY YOU LIKE IT</span><h2 id="hw-control-title">Your controls.</h2></div><button type="button" class="hw-icon-button" data-hw="close-controls" aria-label="Close Control Center">${icon('x')}</button></header>
      <div class="hw-control-tiles"><button type="button" data-hw="spaces">${icon('orbit')}<span>Spaces</span></button><button type="button" data-hw="apps">${icon('layout-grid')}<span>All apps</span></button><button type="button" data-hw="welcome">${icon('sun')}<span>Welcome</span></button></div>
      <div class="hw-control-section">
        <label class="hw-setting"><span><strong>Quiet motion</strong><small>Gentler transitions throughout Hole</small></span><input type="checkbox" data-hw-pref="quiet" role="switch"></label>
        <label class="hw-setting"><span><strong>Focus</strong><small>Give your workspace a quieter welcome</small></span><input type="checkbox" data-hw-pref="focus" role="switch"></label>
        <label class="hw-setting"><span><strong>Product stories</strong><small>Discover the Creating Co ecosystem</small></span><input type="checkbox" data-hw-pref="stories" role="switch"></label>
        <label class="hw-setting"><span><strong>Appearance</strong><small>Color, at your own pace</small></span><select data-hw-theme aria-label="Appearance"><option value="auto">Automatic</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      </div>
      <div class="hw-control-section hw-layout-setting"><span class="hw-eyebrow">WORKSPACE LAYOUT</span><div class="hw-segment" role="group" aria-label="Workspace layout"><button type="button" data-hw-layout="desktop">${icon('monitor')} Desktop</button><button type="button" data-hw-layout="pocket">${icon('smartphone')} Pocket</button></div></div>
      <div class="hw-setup"><div class="hw-setup-icon">${icon('send-to-back')}</div><div><h3>Take your setup.</h3><p>Carry your layout to another browser. Files and notes stay here; this is a setup file, not sync.</p></div><div class="hw-setup-actions"><button type="button" class="hw-soft-button" data-hw="export">${icon('download')} Export setup</button><button type="button" class="hw-soft-button" data-hw="import">${icon('upload')} Import setup</button></div><input type="file" accept=".json,application/json" class="hw-setup-input" aria-label="Choose a Hole workspace setup" hidden></div>
      <label class="hw-setting hw-start-setting"><span><strong>Start at Welcome</strong><small>When you open Hole in this browser</small></span><input type="checkbox" data-hw-pref="startHere" role="switch"></label>
      <p class="hw-control-note">These controls apply to Hole in this browser.</p>
    </div>`;
  const toast = document.createElement('div'); toast.className = 'hw-toast'; toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); toast.hidden = true;
  os.append(welcome, controls, toast);
  const topbarButton = document.createElement('button');
  topbarButton.type = 'button'; topbarButton.className = 'hw-topbar-control cursor-interaction'; topbarButton.dataset.controlCenter = '';
  topbarButton.setAttribute('aria-label', 'Open Control Center'); topbarButton.setAttribute('aria-haspopup', 'dialog'); topbarButton.setAttribute('aria-expanded', 'false'); topbarButton.innerHTML = icon('sliders-horizontal');
  root.querySelector('.hf-topbar')?.append(topbarButton);

  function moving() { return !prefs.quiet && !reduced.matches && H.motion(); }
  function animate(el, frames, options) { return moving() ? el.animate(frames, options) : null; }
  function notify(message) { clearTimeout(toastTimer); toast.textContent = message; toast.hidden = false; toastTimer = setTimeout(() => { toast.hidden = true; }, 4200); }
  function persist() { try { localStorage.setItem(storageKey, JSON.stringify(prefs)); } catch { notify('Your preferences work now, but this browser could not save them.'); } }
  function syncPrefs() {
    os.dataset.quiet = String(prefs.quiet); os.dataset.focus = String(prefs.focus); os.dataset.stories = String(prefs.stories);
    root.style.colorScheme = prefs.theme === 'auto' ? 'light dark' : prefs.theme;
    welcome.querySelector('.hw-story-card').hidden = prefs.focus || !prefs.stories;
    root.querySelectorAll('[data-hw-pref]').forEach(input => { input.checked = prefs[input.dataset.hwPref]; });
    controls.querySelector('[data-hw-theme]').value = prefs.theme;
    controls.querySelectorAll('[data-hw-layout]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.hwLayout === H.state.layout)));
    root.dispatchEvent(new CustomEvent('hole:preferences-change', { detail: { ...prefs } }));
  }
  function makeInert(except) {
    const snapshot = new Map();
    [...os.children].forEach(child => { if (child !== except && child !== toast) { snapshot.set(child, child.inert); child.inert = true; } });
    return snapshot;
  }
  function restoreInert(snapshot) { snapshot?.forEach((value, child) => { if (child.isConnected) child.inert = value; }); }
  function focusable(panel) { return [...panel.querySelectorAll('button,a[href],input,select,[tabindex="0"]')].filter(el => !el.disabled && !el.closest('[hidden],[inert]') && el.getClientRects().length); }
  function returnFocus(target) { if (target?.isConnected && !target.closest('[hidden],[inert]')) target.focus({ preventScroll: true }); else root.querySelector('.hf-brand')?.focus({ preventScroll: true }); }
  function openWelcome() {
    closeControls(false, true);
    if (!welcome.hidden && !welcome.inert) { welcome.querySelector('.hw-enter').focus({ preventScroll: true }); return; }
    welcome.getAnimations().forEach(animation => animation.cancel());
    welcomeEpoch++; welcomeReturn = document.activeElement; welcomeBackground = makeInert(welcome);
    welcome.hidden = false; welcome.inert = false; os.dataset.welcome = 'true';
    syncPrefs(); renderRecent(); clock();
    animate(welcome, [{ opacity: 0, transform: 'scale(1.035)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 520, easing: 'cubic-bezier(.2,.85,.2,1)' });
    welcome.querySelectorAll('.hw-rise').forEach((el, i) => animate(el, [{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: 50 + i * 45, fill: 'backwards', easing: 'cubic-bezier(.2,.85,.2,1)' }));
    welcome.querySelector('.hw-enter').focus({ preventScroll: true });
  }
  function closeWelcome(restore = true, immediate = false) {
    closeControls(false, true);
    if (welcome.hidden) return;
    const epoch = ++welcomeEpoch; welcome.inert = true; os.dataset.welcome = 'false';
    restoreInert(welcomeBackground); welcomeBackground = null;
    const transition = immediate ? null : animate(welcome, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.045)' }], { duration: 340, easing: 'cubic-bezier(.3,0,.2,1)' });
    const finish = () => { if (epoch === welcomeEpoch) { welcome.hidden = true; welcome.inert = true; } };
    if (transition) transition.finished.then(finish, finish); else finish();
    if (restore) returnFocus(welcomeReturn);
  }
  function openControls() {
    if (!controls.hidden && !controls.inert) return;
    controls.getAnimations().forEach(animation => animation.cancel());
    controlEpoch++; controlReturn = document.activeElement; controlBackground = makeInert(controls);
    controls.hidden = false; controls.inert = false; topbarButton.setAttribute('aria-expanded', 'true'); syncPrefs();
    animate(controls, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    animate(controls.querySelector('.hw-control-panel'), [{ opacity: 0, transform: 'translateY(-12px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.18,.9,.2,1)' });
    controls.querySelector('[data-hw="close-controls"]').focus({ preventScroll: true });
  }
  function closeControls(restore = true, immediate = false) {
    if (controls.hidden) return;
    const epoch = ++controlEpoch; controls.inert = true; restoreInert(controlBackground); controlBackground = null;
    topbarButton.setAttribute('aria-expanded', 'false');
    const transition = immediate ? null : animate(controls, [{ opacity: 1 }, { opacity: 0 }], { duration: 180 });
    const finish = () => { if (epoch === controlEpoch) { controls.hidden = true; controls.inert = true; } };
    if (transition) transition.finished.then(finish, finish); else finish();
    if (restore) returnFocus(controlReturn);
  }
  function leave() { closeControls(false, true); closeWelcome(false); if (H.isDrawerOpen) H.closeDrawer({ restoreFocus: false }); }
  function enterSpace(id = 'overview') {
    leave(); H.windows.forEach(rec => { if (!rec.el.hidden) H.minimize(rec); }); H.visitSpace(id);
    requestAnimationFrame(() => (root.querySelector('.hf-space-nav [data-space="' + id + '"]') || root.querySelector('.hf-brand'))?.focus({ preventScroll: true }));
  }
  function launch(name, source) {
    if (!H.byName.has(name)) { notify(name + ' is coming to this workspace. Explore the ecosystem at thecreatingco.com.'); return; }
    leave();
    if (name === 'Files' && window.HoleFiles) { window.HoleFiles.openFiles(); return; }
    H.openApp(name, source);
  }
  const stories = [
    { app: 'Glyph', title: 'A font. An artwork.<br>A whole new direction.', body: 'Follow a letter into something entirely yours.', art: 'Aa', style: 'type' },
    { app: 'Luma', title: 'A little color.<br>A lot of possibility.', body: 'Make room for the next thing you want to create.', art: '↗', style: 'color' },
    { app: 'Form', title: 'Give an idea<br>a new dimension.', body: 'A place for shape, space, and a different point of view.', art: '◎', style: 'form' }
  ];
  function renderStory() {
    const story = stories[storyIndex], card = welcome.querySelector('.hw-story-card');
    card.dataset.story = story.style;
    card.querySelector('.hw-story-copy').innerHTML = '<h2>' + story.title + '</h2><p>' + story.body + '</p>';
    card.querySelector('.hw-story-art').textContent = story.art;
    const button = card.querySelector('.hw-story-open'); button.dataset.hwApp = story.app; button.innerHTML = 'Explore ' + story.app + ' ' + icon('arrow-up-right');
    H.icons();
  }
  function renderRecent() {
    const list = welcome.querySelector('.hw-recents'); list.replaceChildren();
    const recent = window.HoleFiles?.getRecent?.(3) || [];
    if (!recent.length) {
      const empty = document.createElement('div'); empty.className = 'hw-recent-empty';
      empty.innerHTML = icon('folder-open') + '<div><strong>Your files start here.</strong><p>Import something into Files to keep it close.</p></div>';
      list.append(empty);
    } else recent.forEach(file => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'hw-recent-file'; button.dataset.hwFile = file.id;
      const mime = String(file.type || ''), glyph = mime.startsWith('audio/') ? 'audio-lines' : mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'film' : 'file-text';
      button.innerHTML = '<span class="hw-recent-icon">' + icon(glyph) + '</span><span class="hw-recent-copy"><strong></strong><small></small></span>' + icon('arrow-up-right');
      button.querySelector('strong').textContent = file.name; button.querySelector('small').textContent = (names[file.space] || H.state.projects?.find(space => space.id === file.space)?.name || 'My desk') + ' · in this browser'; list.append(button);
    });
    const jobs = window.HoleFiles?.getJobs?.(4) || [], active = jobs.find(job => !['complete', 'completed', 'cancelled', 'failed', 'error'].includes(job.status)), latest = active || jobs[0];
    const widget = welcome.querySelector('.hw-job-widget'); widget.hidden = !latest; widget.replaceChildren();
    if (latest) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.hw = 'activity';
      button.innerHTML = icon(active ? 'loader-circle' : ['failed', 'error'].includes(latest.status) ? 'circle-alert' : 'circle-check') + '<span><strong></strong><small></small></span>' + icon('arrow-up-right');
      button.querySelector('strong').textContent = latest.name || 'File activity'; button.querySelector('small').textContent = latest.step || latest.status;
      widget.append(button);
    }
    H.icons();
  }
  function clock() {
    const now = new Date(), time = welcome.querySelector('.hw-clock');
    time.dateTime = now.toISOString(); time.textContent = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(now);
    welcome.querySelector('.hw-date').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  }
  function exportSetup() {
    if (!H.exportSetup) { notify('Setup export is not available yet.'); return; }
    try {
      const setup = { ...H.exportSetup(), welcome: { ...prefs } }, blob = new Blob([JSON.stringify(setup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = 'hole-workspace-setup.json'; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      notify('Setup download prepared. Your files and notes remain in this browser.');
    } catch { notify('This setup could not be exported. Please try again.'); }
  }
  const setupInput = controls.querySelector('.hw-setup-input');
  setupInput.addEventListener('change', async () => {
    const file = setupInput.files?.[0]; setupInput.value = ''; if (!file) return;
    if (file.size > 1024 * 1024) { notify('Choose a Hole setup file smaller than 1 MB.'); return; }
    try {
      const setup = JSON.parse(await file.text());
      if (!setup || typeof setup !== 'object' || Array.isArray(setup) || setup.format !== 'hole-workspace' || setup.version !== 1 || !['desktop', 'pocket'].includes(setup.layout) || !setup.desk || typeof setup.desk !== 'object' || Array.isArray(setup.desk)) throw new Error('Invalid setup');
      const customSpace = typeof setup.desk.view === 'string' && /^space-[a-z0-9-]{1,60}$/.test(setup.desk.view) && Array.isArray(setup.projects) && setup.projects.some(space => space && space.id === setup.desk.view && typeof space.name === 'string' && space.name.trim());
      if (!['desk', 'studio', 'life', 'overview'].includes(setup.desk.view) && !customSpace) throw new Error('Invalid setup');
      if (!H.importSetup || !H.importSetup(setup)) throw new Error('Invalid setup');
      const incoming = setup.welcome;
      if (incoming && typeof incoming === 'object') {
        for (const key of ['quiet', 'focus', 'stories', 'startHere']) if (typeof incoming[key] === 'boolean') prefs[key] = incoming[key];
        if (['auto', 'light', 'dark'].includes(incoming.theme)) prefs.theme = incoming.theme;
        persist(); syncPrefs();
      }
      notify('Your layout is here. Files and notes were not changed.');
    } catch { notify('That is not a valid Hole workspace setup. Your layout was not imported.'); }
  });
  root.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (target?.matches('.hf-brand[data-home], [data-control-center]')) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (target.matches('.hf-brand')) openWelcome(); else openControls(); return;
    }
    if (!target || !(welcome.contains(target) || controls.contains(target))) return;
    event.stopPropagation();
    if (target.dataset.hwSpace) { enterSpace(target.dataset.hwSpace); return; }
    if (target.dataset.hwApp) { launch(target.dataset.hwApp, target); return; }
    if (target.dataset.hwFile) { leave(); window.HoleFiles?.openFiles(target.dataset.hwFile); return; }
    if (target.dataset.hwLayout) { H.setLayout?.(target.dataset.hwLayout); syncPrefs(); return; }
    const action = target.dataset.hw;
    if (action === 'controls') openControls();
    if (action === 'close-controls') closeControls();
    if (action === 'welcome') openWelcome();
    if (action === 'enter' || action === 'spaces') enterSpace('overview');
    if (action === 'apps') { leave(); H.openDrawer({ focus: true }); }
    if (action === 'files') launch('Files', target);
    if (action === 'activity') { leave(); window.HoleFiles?.showActivity(); }
    if (action === 'dismiss-story') { prefs.stories = false; persist(); syncPrefs(); welcome.querySelector('[data-hw="controls"]').focus({ preventScroll: true }); notify('Product stories hidden. You can bring them back in Control Center.'); }
    if (action === 'next-story') { storyIndex = (storyIndex + 1) % stories.length; renderStory(); animate(welcome.querySelector('.hw-story-copy'), [{ opacity: 0, transform: 'translateX(8px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'ease-out' }); }
    if (action === 'export') exportSetup();
    if (action === 'import') setupInput.click();
  }, true);
  controls.addEventListener('click', event => { if (event.target === controls) closeControls(); });
  // Keep workspace pan, zoom, and launcher shortcuts behind the active dialog.
  welcome.addEventListener('keydown', event => event.stopPropagation());
  controls.addEventListener('keydown', event => event.stopPropagation());
  root.addEventListener('change', event => {
    const input = event.target;
    if (input.matches('[data-hw-pref]') && Object.hasOwn(defaults, input.dataset.hwPref)) { prefs[input.dataset.hwPref] = input.checked; persist(); syncPrefs(); }
    if (input.matches('[data-hw-theme]') && ['auto', 'light', 'dark'].includes(input.value)) { prefs.theme = input.value; persist(); syncPrefs(); }
  });
  document.addEventListener('keydown', event => {
    const panel = !controls.hidden && !controls.inert ? controls : !welcome.hidden && !welcome.inert ? welcome : null;
    if (!panel) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (panel === controls) closeControls(); else closeWelcome(); }
    if (event.key === 'Tab') {
      const items = focusable(panel), first = items[0], last = items[items.length - 1];
      if (!items.length) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
  }, true);
  root.addEventListener('hole:files-change', renderRecent); root.addEventListener('hole:jobs-change', renderRecent);
  root.addEventListener('hole:space-change', () => controls.querySelectorAll('[data-hw-layout]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.hwLayout === H.state.layout))));
  window.addEventListener('storage', event => {
    if (event.key !== storageKey || !event.newValue) return;
    try { const next = JSON.parse(event.newValue); for (const key of ['quiet', 'focus', 'stories', 'startHere']) if (typeof next[key] === 'boolean') prefs[key] = next[key]; if (['auto', 'light', 'dark'].includes(next.theme)) prefs.theme = next.theme; syncPrefs(); } catch { /* Ignore malformed external storage updates. */ }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) clock(); });
  setInterval(() => { if (!document.hidden && !welcome.hidden) clock(); }, 30000);
  window.HoleWelcome = { open: openWelcome, close: closeWelcome, openControls, closeControls, notify, get preferences() { return { ...prefs }; } };
  renderStory(); renderRecent(); syncPrefs(); clock(); H.icons();
  if (prefs.startHere) requestAnimationFrame(openWelcome);
})();
