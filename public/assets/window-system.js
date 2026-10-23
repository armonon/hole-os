/* Window geometry and edge gestures belong to the shell, never to app content. */
(() => {
  'use strict';
  const api = window.HoleOS;
  if (!api || window.HoleWindows) return;
  const { root, os, field, windows, dock } = api;
  const bottom = root.querySelector('.hf-bottom');
  const clamp = (value, low, high) => Math.max(low, Math.min(Math.max(low, high), value));
  const storageKey = 'hole.window-geometry.v1';
  const easing = 'cubic-bezier(.18,.86,.24,1)';
  let saved = {}, fullRecord = null, geometryDrag = null, swipe = null;
  let fullscreenInert = null;
  let dockTimer = 0, hoverTimer = 0, ignoreHandleClickUntil = 0;
  let lastSpace = api.state.desk.view === 'overview' ? 'desk' : api.state.desk.view;
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) saved = value;
  } catch { /* Local persistence may be unavailable in a private browser. */ }

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'hf-system-handle cursor-interaction';
  handle.setAttribute('aria-label', 'Show dock. Swipe up farther for desktop or all spaces.');
  handle.setAttribute('aria-expanded', 'true');
  dock.id ||= 'hole-system-dock';
  handle.setAttribute('aria-controls', dock.id);
  handle.innerHTML = '<span aria-hidden="true"></span>';
  bottom.append(handle);

  const preview = document.createElement('div');
  preview.className = 'hf-edge-preview';
  preview.hidden = true;
  preview.innerHTML = '<span class="hf-edge-preview-symbol" aria-hidden="true"></span><span class="hf-edge-preview-label" role="status" aria-live="polite"></span><span class="hf-edge-progress" aria-hidden="true"><b></b><i></i><i></i><i></i></span>';
  os.append(preview);
  const previewLabel = preview.querySelector('.hf-edge-preview-label');
  const previewSymbol = preview.querySelector('.hf-edge-preview-symbol');
  const progress = preview.querySelector('.hf-edge-progress b');

  function validGeometry(value) {
    return value && ['x', 'y', 'w', 'h'].every(key => Number.isFinite(value[key])) && value.w > 0 && value.h > 0;
  }
  function remember(rec) {
    if (!rec || rec.holeFullscreen || !rec.el.isConnected) return;
    const geometry = { x: rec.x, y: rec.y, w: rec.w, h: rec.h };
    if (!validGeometry(geometry)) return;
    rec.holeGeometry = geometry;
    saved[rec.app.name] = geometry;
    try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch { /* Keep working without storage. */ }
  }
  function limits() {
    const width = Math.max(1, field.clientWidth), height = Math.max(1, field.clientHeight);
    const margin = width < 420 ? 6 : 10;
    return { width, height, margin, minWidth: Math.min(264, width - margin * 2), minHeight: Math.min(190, height - margin * 2) };
  }
  function geometryFor(rec) {
    const { width, height, margin, minWidth, minHeight } = limits();
    if (rec.holeFullscreen && fullRecord === rec && os.dataset.appFullscreen === 'true') {
      return { x: 0, y: 0, w: width, h: height };
    }
    const value = rec.holeGeometry || saved[rec.app.name];
    const compact = api.state.layout === 'pocket' || width < 560;
    const initial = validGeometry(value) ? value : {
      x: compact ? margin : rec.x,
      y: compact ? margin : rec.y,
      w: compact ? width - margin * 2 : rec.app.name === 'Music' ? 340 : 460,
      h: compact ? height - margin * 2 : rec.app.name === 'Music' ? 435 : 390
    };
    const w = clamp(initial.w, minWidth, width - margin * 2);
    const h = clamp(initial.h, minHeight, height - margin * 2);
    return { x: clamp(initial.x, margin, width - w - margin), y: clamp(initial.y, margin, height - h - margin), w, h };
  }
  function sizeWindow(rec) {
    enhance(rec);
    if (!field.clientWidth || !field.clientHeight) return { x: rec.x, y: rec.y, w: rec.w, h: rec.h };
    const geometry = geometryFor(rec);
    Object.assign(rec, geometry);
    Object.assign(rec.el.style, { left: geometry.x + 'px', top: geometry.y + 'px', width: geometry.w + 'px', height: geometry.h + 'px' });
    const maximize = rec.el.querySelector('[data-maximize]');
    if (maximize) {
      maximize.hidden = false;
      maximize.setAttribute('aria-label', (rec.holeFullscreen ? 'Restore ' : 'Fullscreen ') + rec.app.name);
      maximize.setAttribute('aria-pressed', String(!!rec.holeFullscreen));
    }
    rec.el.dataset.fullscreen = String(!!rec.holeFullscreen);
    rec.el.querySelector('.hf-window-resizer').hidden = !!rec.holeFullscreen;
    return geometry;
  }
  function animateLayout(rec, before) {
    rec.holeLayoutAnimation?.cancel();
    if (!api.motion() || !before || !before.width || rec.el.hidden) return;
    const after = rec.el.getBoundingClientRect();
    if (!after.width || !after.height) return;
    rec.holeLayoutAnimation = rec.el.animate([
      { transform: `translate(${before.left - after.left}px,${before.top - after.top}px) scale(${before.width / after.width},${before.height / after.height})`, borderRadius: rec.holeFullscreen ? '26px' : '12px' },
      { transform: 'none', borderRadius: rec.holeFullscreen ? '12px' : '26px' }
    ], { duration: 480, easing });
  }
  function syncFullscreen() {
    const active = !!(fullRecord && !fullRecord.minimized && !fullRecord.closing && !fullRecord.el.hidden && !api.isDrawerOpen);
    const changed = os.dataset.appFullscreen !== String(active);
    os.dataset.appFullscreen = String(active);
    if (changed) {
      if (active) {
        fullscreenInert = new Map([[api.desktop, api.desktop.inert]]);
        api.desktop.inert = true;
        windows.forEach(rec => {
          if (rec === fullRecord) return;
          fullscreenInert.set(rec.el, rec.el.inert);
          rec.el.inert = true;
        });
      } else if (fullscreenInert) {
        fullscreenInert.forEach((inert, element) => {
          if (element.isConnected) element.inert = element === api.desktop ? api.isDrawerOpen || inert : inert;
        });
        fullscreenInert = null;
      }
      os.dataset.dockRevealed = String(!active);
      dock.inert = active;
      handle.setAttribute('aria-expanded', String(!active));
      api.resize();
    }
    return active;
  }
  function setFullscreen(rec, enabled, animate = true) {
    if (!rec || !rec.el.isConnected || (!!rec.holeFullscreen === enabled && (enabled ? fullRecord === rec : true))) return;
    finishGeometry(false);
    const before = rec.el.getBoundingClientRect();
    rec.holeLayoutAnimation?.cancel();
    rec.el.querySelector('.hf-window-size-menu')?.setAttribute('hidden', '');
    if (enabled) {
      if (fullRecord && fullRecord !== rec) setFullscreen(fullRecord, false, false);
      remember(rec);
      fullRecord = rec;
      rec.holeFullscreen = true;
      rec.max = true;
    } else {
      rec.holeFullscreen = false;
      rec.max = false;
      if (fullRecord === rec) fullRecord = null;
    }
    syncFullscreen();
    sizeWindow(rec);
    if (animate) animateLayout(rec, before);
  }
  function exitFullscreen(animate = false) {
    if (fullRecord) setFullscreen(fullRecord, false, animate);
  }
  function revealDock(focus = false) {
    clearTimeout(dockTimer);
    os.dataset.dockRevealed = 'true';
    dock.inert = false;
    handle.setAttribute('aria-expanded', 'true');
    if (focus) dock.querySelector('button')?.focus({ preventScroll: true });
  }
  function scheduleHideDock() {
    clearTimeout(dockTimer);
    if (os.dataset.appFullscreen !== 'true') return;
    dockTimer = setTimeout(() => {
      if (swipe || dock.matches(':hover') || handle.matches(':hover') || dock.contains(document.activeElement)) return;
      os.dataset.dockRevealed = 'false';
      dock.inert = true;
      handle.setAttribute('aria-expanded', 'false');
    }, 950);
  }
  function closeSizeMenus(except) {
    windows.forEach(rec => {
      const menu = rec.el.querySelector('.hf-window-size-menu');
      if (rec !== except && menu) {
        menu.hidden = true;
        rec.el.querySelector('.hf-window-resizer')?.setAttribute('aria-expanded', 'false');
      }
    });
  }
  function applyGeometry(rec, value, persist = false) {
    rec.holeGeometry = value;
    sizeWindow(rec);
    if (persist) remember(rec);
  }
  // Movement and resizing are previews until the initiating pointer is released.
  // Clear ownership before releasing capture: lostpointercapture can fire here.
  function finishGeometry(commit, event) {
    if (!geometryDrag || (event && event.pointerId !== geometryDrag.id)) return false;
    const finished = geometryDrag;
    geometryDrag = null;
    finished.rec.el.classList.remove('is-resizing');
    finished.onFinish?.(finished.moved);
    if (commit) remember(finished.rec);
    else applyGeometry(finished.rec, finished.original);
    if (finished.target.hasPointerCapture(finished.id)) finished.target.releasePointerCapture(finished.id);
    return true;
  }
  function presetSize(rec, preset) {
    const before = rec.el.getBoundingClientRect();
    const { width, height, margin } = limits();
    if (rec.holeFullscreen) setFullscreen(rec, false, false);
    const w = preset === 'fit' ? width - margin * 2 : Math.min(width - margin * 2, preset === 'small' ? 340 : 620);
    const h = preset === 'fit' ? height - margin * 2 : Math.min(height - margin * 2, preset === 'small' ? 300 : 440);
    applyGeometry(rec, { x: (width - w) / 2, y: (height - h) / 2, w, h }, true);
    rec.el.querySelector('.hf-window-size-menu').hidden = true;
    rec.el.querySelector('.hf-window-resizer').setAttribute('aria-expanded', 'false');
    rec.el.querySelector('.hf-window-resizer').focus({ preventScroll: true });
    animateLayout(rec, before);
  }
  function enhance(rec) {
    if (!rec || rec.holeEnhanced) return;
    rec.holeEnhanced = true;
    if (validGeometry(saved[rec.app.name])) rec.holeGeometry = { ...saved[rec.app.name] };
    const resizer = document.createElement('button');
    resizer.type = 'button';
    resizer.className = 'hf-window-resizer cursor-interaction';
    resizer.setAttribute('aria-label', 'Resize ' + rec.app.name + '. Drag or use arrow keys; press Enter for window sizes.');
    resizer.setAttribute('aria-expanded', 'false');
    resizer.innerHTML = '<span aria-hidden="true"></span>';
    const menu = document.createElement('div');
    menu.className = 'hf-window-size-menu';
    menu.hidden = true;
    menu.setAttribute('aria-label', rec.app.name + ' window sizes');
    menu.innerHTML = '<span>Make room</span><button type="button" data-window-size="small">Compact</button><button type="button" data-window-size="medium">Comfortable</button><button type="button" data-window-size="fit">Fit desktop</button>';
    rec.el.append(resizer, menu);
    let suppressClick = false;
    resizer.addEventListener('pointerdown', event => {
      if (event.button !== 0 || rec.holeFullscreen || geometryDrag || swipe) return;
      closeSizeMenus();
      rec.holeLayoutAnimation?.cancel();
      geometryDrag = { kind: 'resize', rec, target: resizer, id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, original: { x: rec.x, y: rec.y, w: rec.w, h: rec.h }, onFinish: moved => { suppressClick = moved; } };
      suppressClick = false;
      resizer.setPointerCapture(event.pointerId);
      rec.el.classList.add('is-resizing');
      event.preventDefault();
    });
    resizer.addEventListener('pointermove', event => {
      const drag = geometryDrag;
      if (!drag || drag.kind !== 'resize' || drag.rec !== rec || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      drag.moved ||= Math.hypot(dx, dy) > 4;
      const { width, height, margin, minWidth, minHeight } = limits();
      applyGeometry(rec, {
        x: drag.original.x, y: drag.original.y,
        w: clamp(drag.original.w + dx, minWidth, width - drag.original.x - margin),
        h: clamp(drag.original.h + dy, minHeight, height - drag.original.y - margin)
      });
      event.preventDefault();
    });
    function finishResize(event) {
      if (geometryDrag?.kind === 'resize' && geometryDrag.rec === rec) finishGeometry(event.type === 'pointerup', event);
    }
    resizer.addEventListener('pointerup', finishResize);
    resizer.addEventListener('pointercancel', finishResize);
    resizer.addEventListener('lostpointercapture', finishResize);
    resizer.addEventListener('click', event => {
      event.stopPropagation();
      if (suppressClick) { suppressClick = false; return; }
      closeSizeMenus(rec);
      menu.hidden = !menu.hidden;
      resizer.setAttribute('aria-expanded', String(!menu.hidden));
      if (!menu.hidden) menu.querySelector('button').focus({ preventScroll: true });
    });
    resizer.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      finishGeometry(false);
      const step = event.shiftKey ? 48 : 16;
      const { width, height, margin, minWidth, minHeight } = limits();
      const dw = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
      const dh = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
      applyGeometry(rec, { x: rec.x, y: rec.y, w: clamp(rec.w + dw, minWidth, width - rec.x - margin), h: clamp(rec.h + dh, minHeight, height - rec.y - margin) }, true);
    });
    menu.addEventListener('click', event => {
      const button = event.target.closest('[data-window-size]');
      if (button) { event.stopPropagation(); presetSize(rec, button.dataset.windowSize); }
    });
    menu.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation();
      menu.hidden = true;
      resizer.setAttribute('aria-expanded', 'false');
      resizer.focus({ preventScroll: true });
    });
    const header = rec.el.querySelector('.hf-window-header');
    header.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button') || rec.holeFullscreen || geometryDrag || swipe) return;
      closeSizeMenus();
      rec.holeLayoutAnimation?.cancel();
      rec.animation?.cancel();
      geometryDrag = { kind: 'move', rec, target: header, id: event.pointerId, x: event.clientX, y: event.clientY, original: { x: rec.x, y: rec.y, w: rec.w, h: rec.h } };
      header.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    header.addEventListener('pointermove', event => {
      const drag = geometryDrag;
      if (!drag || drag.kind !== 'move' || drag.rec !== rec || drag.id !== event.pointerId) return;
      const { width, height, margin } = limits();
      applyGeometry(rec, { x: clamp(drag.original.x + event.clientX - drag.x, margin, width - rec.w - margin), y: clamp(drag.original.y + event.clientY - drag.y, margin, height - rec.h - margin), w: rec.w, h: rec.h });
      event.preventDefault();
    });
    const finishMove = event => { if (geometryDrag?.kind === 'move' && geometryDrag.rec === rec) finishGeometry(event.type === 'pointerup', event); };
    header.addEventListener('pointerup', finishMove);
    header.addEventListener('pointercancel', finishMove);
    header.addEventListener('lostpointercapture', finishMove);
  }

  function visibleRecords() {
    return [...windows.values()].filter(rec => !rec.el.hidden && !rec.minimized && !rec.closing).sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex));
  }
  function minimizeToDesktop(destination = lastSpace) {
    exitFullscreen(false);
    if (api.isDrawerOpen) api.closeDrawer({ restoreFocus: false });
    visibleRecords().forEach(rec => api.minimize(rec));
    api.visitSpace(destination);
    requestAnimationFrame(() => {
      const target = root.querySelector('.hf-space-nav [data-space="' + destination + '"]') || root.querySelector('[data-space="' + destination + '"]');
      if (target && target.getClientRects().length && !target.closest('[hidden],[inert]')) target.focus({ preventScroll: true });
    });
  }
  const stageNames = ['Pull up to travel', 'Dock', 'Your desktop', 'All spaces'];
  const stageSymbols = ['↑', '•••', '▱', '◉'];
  function gestureStage(fraction, previous = 0) {
    const distance = Number.isFinite(fraction) ? Math.max(0, fraction) : 0;
    const thresholds = [0, .1, .3, .5];
    let stage = Math.max(0, Math.min(3, Math.trunc(previous) || 0));
    while (stage < 3 && distance >= thresholds[stage + 1]) stage++;
    while (stage > 0 && distance < thresholds[stage] - .025) stage--;
    return stage;
  }
  function previewSwipe() {
    if (!swipe) return;
    const fraction = swipe.fraction;
    const stage = gestureStage(fraction, swipe.stage);
    if (stage !== swipe.stage || preview.hidden) {
      previewLabel.textContent = stageNames[stage];
      previewSymbol.textContent = stageSymbols[stage];
    }
    swipe.stage = stage;
    preview.dataset.stage = String(stage);
    preview.hidden = fraction < .015;
    progress.style.width = Math.min(100, fraction / .5 * 100) + '%';
    if (swipe.rec && fraction > .01) {
      const scale = 1 - Math.min(.38, fraction * .6);
      swipe.rec.el.classList.add('is-edge-gesturing');
      swipe.rec.el.style.transform = `translateY(${-Math.min(72, fraction * swipe.height * .18)}px) scale(${scale})`;
      swipe.rec.el.style.opacity = String(1 - Math.min(.35, fraction * .42));
    }
    if (stage >= 1) revealDock();
    else if (swipe.wasFullscreen && !swipe.wasDockVisible) {
      os.dataset.dockRevealed = 'false'; dock.inert = true;
      handle.setAttribute('aria-expanded', 'false');
    }
  }
  function finishSwipe(commit) {
    if (!swipe) return;
    const finished = swipe;
    swipe = null;
    if (handle.hasPointerCapture(finished.id)) handle.releasePointerCapture(finished.id);
    const rec = finished.rec;
    if (rec) {
      const transform = rec.el.style.transform, opacity = rec.el.style.opacity;
      rec.el.style.transform = finished.transform;
      rec.el.style.opacity = finished.opacity;
      rec.el.classList.remove('is-edge-gesturing');
      if (api.motion() && (!commit || finished.stage < 2) && finished.fraction > .015) {
        rec.el.animate([{ transform, opacity }, { transform: finished.transform || 'none', opacity: finished.opacity || '1' }], { duration: 340, easing });
      }
    }
    preview.hidden = true;
    if (finished.fraction > .015) ignoreHandleClickUntil = performance.now() + 400;
    if (!commit || finished.stage === 0) {
      os.dataset.dockRevealed = String(finished.wasDockVisible);
      dock.inert = !finished.wasDockVisible;
      handle.setAttribute('aria-expanded', String(finished.wasDockVisible));
      return;
    }
    if (finished.stage === 3) minimizeToDesktop('overview');
    else if (finished.stage === 2) minimizeToDesktop(lastSpace);
    else { revealDock(); scheduleHideDock(); }
  }
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || swipe || geometryDrag) return;
    const rec = api.isDrawerOpen ? null : visibleRecords()[0];
    rec?.holeLayoutAnimation?.cancel();
    rec?.animation?.cancel();
    swipe = { id: event.pointerId, startY: event.clientY, height: Math.max(240, field.clientHeight), fraction: 0, stage: 0, rec, transform: rec?.el.style.transform || '', opacity: rec?.el.style.opacity || '', wasFullscreen: os.dataset.appFullscreen === 'true', wasDockVisible: os.dataset.dockRevealed === 'true' };
    clearTimeout(dockTimer); clearTimeout(hoverTimer);
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener('pointermove', event => {
    if (!swipe || swipe.id !== event.pointerId) return;
    swipe.fraction = clamp((swipe.startY - event.clientY) / swipe.height, 0, .85);
    previewSwipe();
    event.preventDefault();
  });
  handle.addEventListener('pointerup', event => { if (swipe?.id === event.pointerId) finishSwipe(true); });
  handle.addEventListener('pointercancel', event => { if (swipe?.id === event.pointerId) finishSwipe(false); });
  handle.addEventListener('lostpointercapture', event => { if (swipe?.id === event.pointerId) finishSwipe(false); });
  handle.addEventListener('click', event => {
    if (performance.now() < ignoreHandleClickUntil) { event.preventDefault(); return; }
    revealDock(true);
  });
  handle.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse') return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => { if (!swipe) revealDock(); }, 150);
  });
  handle.addEventListener('pointerleave', () => { clearTimeout(hoverTimer); scheduleHideDock(); });
  dock.addEventListener('pointerenter', () => { clearTimeout(dockTimer); });
  dock.addEventListener('pointerleave', scheduleHideDock);
  dock.addEventListener('focusin', () => revealDock());
  dock.addEventListener('focusout', scheduleHideDock);
  root.addEventListener('click', event => {
    const button = event.target.closest('button[data-maximize]');
    if (!button) {
      if (!event.target.closest('.hf-window-size-menu,.hf-window-resizer')) closeSizeMenus();
      return;
    }
    const rec = windows.get(button.closest('.hf-window')?.dataset.app);
    if (!rec) return;
    event.preventDefault(); event.stopImmediatePropagation();
    setFullscreen(rec, !rec.holeFullscreen);
    button.focus({ preventScroll: true });
  }, true);
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (finishGeometry(false)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (event.target.closest('[role="dialog"],dialog')) return;
    if (swipe) { event.preventDefault(); event.stopImmediatePropagation(); finishSwipe(false); return; }
    if (fullRecord && !api.isDrawerOpen) {
      event.preventDefault(); event.stopImmediatePropagation();
      const rec = fullRecord;
      setFullscreen(rec, false);
      rec.el.querySelector('[data-maximize]')?.focus({ preventScroll: true });
    }
  }, true);
  root.addEventListener('hole:window-change', event => {
    const { type, rec } = event.detail || {};
    if (!rec) return;
    enhance(rec);
    if (type === 'minimize' || type === 'close') {
      if (geometryDrag?.rec === rec) finishGeometry(false);
      if (swipe?.rec === rec) finishSwipe(false);
      if (rec.holeFullscreen) setFullscreen(rec, false, false);
      remember(rec);
    } else if (type === 'focus' || type === 'open') {
      if (fullRecord && fullRecord !== rec) setFullscreen(fullRecord, false, false);
      if (rec.holeFullscreen) syncFullscreen();
    }
  });
  root.addEventListener('hole:space-change', event => {
    finishGeometry(false);
    finishSwipe(false);
    const space = event.detail?.space;
    if (space && space !== 'overview') lastSpace = space;
    exitFullscreen(false);
  });
  new MutationObserver(syncFullscreen).observe(os, { attributes: true, attributeFilter: ['data-drawer-open'] });
  function cancelGestures() {
    finishSwipe(false);
    finishGeometry(false);
  }
  window.addEventListener('blur', cancelGestures);
  window.addEventListener('resize', cancelGestures);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelGestures(); });
  window.HoleWindows = { sizeWindow, revealDock, exitFullscreen, toggleFullscreen: rec => setFullscreen(rec, !rec.holeFullscreen), minimizeToDesktop };
  windows.forEach(sizeWindow);
  syncFullscreen();
})();
