/* Hole's browser-local file library. No files leave this browser. */
(() => {
  'use strict';
  const DB_NAME = 'hole-file-library-v1';
  const MAX_IMPORT_BYTES = 150 * 1024 * 1024;
  const MAX_FILES = 500;
  const RASTER_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif']);
  const FORMAT_TYPES = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
  const uid = () => globalThis.crypto?.randomUUID?.() || `file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const cleanName = name => String(name || 'Untitled').replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(0, 200) || 'Untitled';
  const derivativeName = (name, format) => `${cleanName(name).replace(/\.[^.]+$/, '')}.${format === 'jpeg' ? 'jpg' : format}`;
  const formatBytes = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  const dateLabel = at => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const inferType = file => file.type || ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4', pdf: 'application/pdf' }[file.name?.split('.').pop().toLowerCase()] || 'application/octet-stream');
  const model = Object.freeze({ cleanName, derivativeName, formatBytes, inferType });
  if (typeof document === 'undefined') { globalThis.HoleFileModel = model; return; }

  let initialized = false;
  function initialize() {
    const api = window.HoleOS;
    if (!api || initialized) return;
    initialized = true;
    const { root, os } = api;
    let db, dbError = '', files = [], jobs = [], selectedId = null, mount = null, previewEpoch = 0;
    let quick = null, overlay = null, overlayReturn = null, quickReturn = null, inertRecords = [], busy = false;
    let processing = false, pending = [], previewURLs = [], toastTimer = 0;
    const downloadURLs = new Map();
    const sessionId = uid();
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('hole-file-library-v1') : null;
    const cancelled = new Set();
    const layer = node('div', 'hfiles-layer');
    os.append(layer);
    const toast = node('div', 'hfiles-toast');
    toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); toast.hidden = true; layer.append(toast);

    function node(tag, className, text) {
      const item = document.createElement(tag);
      if (className) item.className = className;
      if (text !== undefined) item.textContent = text;
      return item;
    }
    function icon(name) { const i = node('i'); i.setAttribute('data-lucide', name); i.setAttribute('aria-hidden', 'true'); return i; }
    function button(label, glyph, action, className = '') {
      const b = node('button', `hfiles-button cursor-interaction ${className}`); b.type = 'button'; b.setAttribute('aria-label', label);
      if (glyph) b.append(icon(glyph)); b.append(node('span', '', label)); b.addEventListener('click', action); return b;
    }
    function paintIcons() { api.icons?.(); }
    function animate(item) {
      if (api.motion?.() === false || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      item.animate?.([{ opacity: 0, transform: 'translateY(10px) scale(.98)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    function announce(message) { toast.textContent = message; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 4200); }
    function fileIcon(file) { return file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'music-2' : file.type.startsWith('video/') ? 'film' : 'file-text'; }
    function storageError(error) { return error?.name === 'QuotaExceededError' ? 'This browser is out of storage. Download files you want to keep before clearing site data.' : error?.message || 'Browser storage is unavailable. Your original file has not changed.'; }
    function request(req) { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
    function transaction(stores, mode, action) {
      return new Promise((resolve, reject) => {
        if (!db) { reject(new Error(dbError || 'File storage is still opening. Try again in a moment.')); return; }
        const tx = db.transaction(stores, mode); let result;
        tx.oncomplete = () => resolve(result); tx.onabort = () => reject(tx.error || new Error('The file change could not be saved.')); tx.onerror = () => {};
        try { result = action(tx); } catch (error) { tx.abort(); reject(error); }
      });
    }
    async function loadStorage() {
      try {
        const opening = indexedDB.open(DB_NAME, 1);
        opening.onupgradeneeded = () => {
          const database = opening.result;
          database.createObjectStore('files', { keyPath: 'id' });
          database.createObjectStore('contents');
          database.createObjectStore('jobs', { keyPath: 'id' });
        };
        opening.onblocked = () => { announce('Close another Hole tab to finish opening the file library.'); };
        db = await request(opening);
        db.onversionchange = () => { db.close(); db = null; dbError = 'Reload Hole to reopen your file library.'; announce(dbError); };
        const tx = db.transaction(['files', 'jobs'], 'readonly');
        [files, jobs] = await Promise.all([request(tx.objectStore('files').getAll()), request(tx.objectStore('jobs').getAll())]);
        files = files.filter(f => typeof f.id === 'string' && typeof f.name === 'string' && typeof f.type === 'string');
        jobs = jobs.filter(j => typeof j.id === 'string').map(restoredJob);
        notifyFiles(); notifyJobs(); renderFiles();
      } catch (error) { dbError = storageError(error); announce(dbError); renderFiles(); }
    }
    function getRecent(limit = 4) { return [...files].sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, limit).map(f => ({ ...f, history: [...(f.history || [])] })); }
    function getJobs(limit = 4) { return [...jobs].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit).map(j => ({ ...j })); }
    function restoredJob(job) {
      if (job.ownerId !== sessionId && ['running', 'queued'].includes(job.status)) return { ...job, status: 'paused', step: 'Started in another session', error: 'This tab is not running this job. Return to its original tab, or run it again here. Your source is safe.' };
      return job;
    }
    function notifyFiles(broadcast = true) { root.dispatchEvent(new CustomEvent('hole:files-change', { detail: { files: getRecent(MAX_FILES), recentFiles: getRecent(8) } })); if (broadcast) channel?.postMessage({ type: 'files' }); }
    function notifyJobs(broadcast = true) { root.dispatchEvent(new CustomEvent('hole:jobs-change', { detail: { jobs: getJobs(8) } })); updateActivityButton(); if (overlay?.dataset.kind === 'activity') renderActivity(); if (broadcast) channel?.postMessage({ type: 'jobs' }); }
    if (channel) channel.onmessage = async event => {
      if (!db) return;
      try {
        if (event.data?.type === 'files') { files = await request(db.transaction('files', 'readonly').objectStore('files').getAll()); notifyFiles(false); renderFiles(); }
        if (event.data?.type === 'jobs') {
          const saved = await request(db.transaction('jobs', 'readonly').objectStore('jobs').getAll()), active = jobs.filter(j => j.ownerId === sessionId && ['queued', 'running'].includes(j.status));
          jobs = saved.map(j => active.find(a => a.id === j.id) || restoredJob(j)); active.filter(j => !jobs.some(k => k.id === j.id)).forEach(j => jobs.push(j)); notifyJobs(false);
        }
      } catch { /* The local session keeps working if another tab is closing its database. */ }
    };
    async function blobFor(id) {
      if (!db) throw new Error(dbError || 'File storage is still opening.');
      const content = await request(db.transaction('contents', 'readonly').objectStore('contents').get(id));
      if (!(content instanceof Blob)) throw new Error('This file’s contents are no longer available in this browser.');
      return content;
    }
    async function saveFile(meta, blob) {
      if (!files.some(file => file.id === meta.id) && files.length >= MAX_FILES) throw new Error('This library holds up to 500 files. Remove a local file before adding another.');
      await transaction(['files', 'contents'], 'readwrite', tx => {
        tx.objectStore('files').put(meta); if (blob) tx.objectStore('contents').put(blob, meta.id);
      });
      const existing = files.findIndex(f => f.id === meta.id);
      if (existing < 0) files.push(meta); else files[existing] = meta;
      notifyFiles(); renderFiles(); return meta;
    }
    async function saveJob(job) {
      const keep = [...jobs].sort((a, b) => b.updatedAt - a.updatedAt);
      const old = keep.slice(60).filter(j => !['queued', 'running'].includes(j.status));
      await transaction(['jobs'], 'readwrite', tx => { const store = tx.objectStore('jobs'); store.put(job); old.forEach(j => store.delete(j.id)); });
      jobs = jobs.filter(j => !old.some(o => o.id === j.id)); notifyJobs();
    }
    function history(type, detail) { return { id: uid(), type, detail, at: Date.now() }; }
    async function importFiles(list) {
      if (!list?.length || busy) return;
      busy = true; renderFiles(); let imported = 0, failed = 0;
      for (const file of list) {
        try {
          if (file.size > MAX_IMPORT_BYTES) throw new Error(`${cleanName(file.name)} is larger than this library’s 150 MB per-file limit.`);
          const now = Date.now(), id = uid(), name = cleanName(file.name);
          await saveFile({ id, name, type: inferType(file), size: file.size, createdAt: now, modifiedAt: now, rootId: id, parentId: null, operation: 'Imported original', space: api.state?.desk?.view === 'overview' ? 'desk' : api.state?.desk?.view || 'desk', history: [history('import', 'Original imported from your device')] }, file);
          selectedId = id; imported++;
        } catch (error) { failed++; announce(storageError(error)); }
      }
      busy = false; renderFiles();
      if (!failed) announce(`${imported} ${imported === 1 ? 'file added' : 'files added'} to this browser.`);
    }
    function downloadLink(file, contents) {
      const link = node('a', 'hfiles-button cursor-interaction');
      link.setAttribute('aria-label', 'Download'); link.setAttribute('aria-disabled', 'true'); link.tabIndex = -1; link.style.textDecoration = 'none';
      const label = node('span', '', 'Preparing…'); link.append(icon('download'), label);
      // Prepare the Blob before the click, so saving is a direct native link action.
      Promise.resolve(contents || blobFor(file.id)).then(blob => {
        let url = downloadURLs.get(file.id);
        if (!url) {
          url = URL.createObjectURL(blob); downloadURLs.set(file.id, url);
          while (downloadURLs.size > 8) { const [oldId, oldURL] = downloadURLs.entries().next().value; downloadURLs.delete(oldId); setTimeout(() => URL.revokeObjectURL(oldURL), 30000); }
        }
        link.href = url; link.download = file.name; link.tabIndex = 0; link.removeAttribute('aria-disabled'); label.textContent = 'Download';
      }, error => { label.textContent = 'Unavailable'; link.title = storageError(error); });
      link.addEventListener('click', event => {
        if (!link.hasAttribute('href')) { event.preventDefault(); announce(link.title || 'The file is still being prepared. Try again in a moment.'); return; }
        announce(`Download requested: ${file.name}`);
        // Let the native anchor default action run before removing a Quick Tools popover.
        if (quick?.contains(link)) setTimeout(() => closeQuick(false), 0);
      });
      return link;
    }
    async function copyName(name) {
      try { await navigator.clipboard.writeText(name); announce('Name copied.'); }
      catch { showCopyFallback(name); }
    }
    function showCopyFallback(name) {
      const content = openOverlay('Copy name', 'copy');
      const input = node('input', 'hfiles-input'); input.value = name; input.readOnly = true; input.setAttribute('aria-label', 'Name to copy');
      content.append(node('p', 'hfiles-muted', 'Select and copy this name with your device’s copy command.'), input); input.focus(); input.select();
    }
    async function duplicateFile(file) {
      try {
        const blob = await blobFor(file.id), now = Date.now(), id = uid();
        const dot = file.name.lastIndexOf('.'), name = dot > 0 ? `${file.name.slice(0, dot)} copy${file.name.slice(dot)}` : `${file.name} copy`;
        const saved = await saveFile({ ...file, id, name: cleanName(name), parentId: file.id, rootId: file.rootId || file.id, createdAt: now, modifiedAt: now, operation: 'Duplicate', history: [history('duplicate', `Copied from ${file.name}`)] }, blob);
        selectedId = saved.id; renderFiles(); announce('A separate copy is ready.');
      } catch (error) { announce(storageError(error)); }
    }
    function renameFile(file) {
      const content = openOverlay('Rename file', 'rename'), form = node('form', 'hfiles-form'), label = node('label', '', 'File name'), input = node('input', 'hfiles-input');
      input.value = file.name; input.maxLength = 200; input.required = true; input.id = `hfiles-rename-${uid()}`; label.htmlFor = input.id;
      const submit = button('Save name', 'check', () => {}); submit.type = 'submit'; const note = node('p', 'hfiles-muted'); note.setAttribute('role', 'status');
      form.append(label, input, submit, note); content.append(form);
      form.addEventListener('submit', async event => {
        event.preventDefault(); const name = cleanName(input.value); if (name === file.name) { closeOverlay(); return; }
        submit.disabled = true;
        try { await saveFile({ ...file, name, modifiedAt: Date.now(), history: [...(file.history || []), history('rename', `Renamed from ${file.name} to ${name}`)].slice(-40) }); closeOverlay(); announce('File renamed.'); }
        catch (error) { note.textContent = storageError(error); submit.disabled = false; }
      }); input.focus(); input.select(); paintIcons();
    }
    function removeFile(file) {
      const content = openOverlay('Remove local file?', 'remove');
      content.append(node('p', 'hfiles-muted', `Remove ${file.name} from this browser’s library? The original on your device and any separate versions stay unchanged.`));
      const actions = node('div', 'hfiles-action-row'), remove = button('Remove file', 'trash-2', async () => {
        remove.disabled = true;
        try {
          await transaction(['files', 'contents'], 'readwrite', tx => { tx.objectStore('files').delete(file.id); tx.objectStore('contents').delete(file.id); });
          files = files.filter(f => f.id !== file.id); if (selectedId === file.id) selectedId = null;
          const downloadURL = downloadURLs.get(file.id); if (downloadURL) { downloadURLs.delete(file.id); setTimeout(() => URL.revokeObjectURL(downloadURL), 30000); }
          closeOverlay(); notifyFiles(); renderFiles(); announce('File removed from this browser.');
        } catch (error) { announce(storageError(error)); remove.disabled = false; }
      });
      actions.append(button('Keep file', 'arrow-left', () => closeOverlay()), remove); content.append(actions); paintIcons();
    }
    function showHistory(file) {
      const content = openOverlay('File history', 'history');
      content.append(node('p', 'hfiles-muted', 'Every result keeps its source. Your originals are never overwritten.'));
      const family = files.filter(f => (f.rootId || f.id) === (file.rootId || file.id)).sort((a, b) => a.createdAt - b.createdAt);
      const list = node('ol', 'hfiles-timeline');
      family.forEach(version => {
        const entry = node('li', version.id === file.id ? 'is-current' : '');
        const open = button(version.name, fileIcon(version), () => { closeOverlay(); openFiles(version.id); }, 'hfiles-version');
        entry.append(open, node('small', 'hfiles-muted', `${version.operation} · ${dateLabel(version.createdAt)}${version.id === file.id ? ' · Current' : ''}`));
        (version.history || []).filter(h => h.type === 'rename').forEach(h => entry.append(node('p', 'hfiles-history-detail', `${h.detail} · ${dateLabel(h.at)}`)));
        list.append(entry);
      }); content.append(list); paintIcons();
    }
    function conversionDialog(file) {
      const content = openOverlay('Make a new version', 'convert');
      content.append(node('p', 'hfiles-muted', `Convert ${file.name}. The original stays in your library.`));
      if (file.type === 'image/gif') content.append(node('p', 'hfiles-muted', 'Animated images become a still image using the first decoded frame.'));
      const options = node('div', 'hfiles-format-options');
      Object.entries(FORMAT_TYPES).forEach(([format]) => options.append(button(format.toUpperCase(), 'image', () => { closeOverlay(); enqueueConversion(file, format); }, 'hfiles-format')));
      content.append(options, node('p', 'hfiles-muted', 'PNG keeps transparency. JPEG uses a white background. WebP creates a compact image.')); paintIcons();
    }
    function audioTools(file) {
      const content = openOverlay('Audio tools', 'audio');
      content.append(node('p', 'hfiles-muted', file.name), node('h3', '', 'Keep creating from here.'), node('p', 'hfiles-muted', 'Playback and downloads work in this browser. Stem separation and transcription need an audio-processing service; neither is connected inside Hole yet. No processing job has been started.'));
      const actions = node('div', 'hfiles-action-row'); actions.append(button('Play file', 'play', () => { closeOverlay(); openFiles(file.id); }), downloadLink(file));
      const split = node('a', 'hfiles-button cursor-interaction', 'Open Split'); split.href = 'https://sattarimusic.com/studio/split'; split.target = '_blank'; split.rel = 'noopener noreferrer'; actions.append(split);
      content.append(actions, node('p', 'hfiles-muted', 'Split opens as an external app. Download your track, then choose it there yourself; Hole does not send the file.')); paintIcons();
    }
    async function enqueueConversion(file, format) {
      if (!FORMAT_TYPES[format] || !RASTER_TYPES.has(file.type)) return;
      const now = Date.now(), job = { id: uid(), ownerId: sessionId, kind: 'convert-image', sourceId: file.id, name: `${file.name} → ${format.toUpperCase()}`, format, status: 'queued', step: 'Queued', progress: 0, createdAt: now, updatedAt: now, outputId: null, error: '' };
      jobs.push(job);
      try { await saveJob(job); pending.push(job); announce('Conversion added to Activity.'); processQueue(); }
      catch (error) { jobs = jobs.filter(j => j !== job); announce(storageError(error)); notifyJobs(); }
    }
    function checkCancelled(job) { if (cancelled.has(job.id)) throw new DOMException('Cancelled', 'AbortError'); }
    async function updateJob(job, patch) { Object.assign(job, patch, { updatedAt: Date.now() }); await saveJob(job); }
    async function decodeImage(blob) {
      if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
      return new Promise((resolve, reject) => { const img = new Image(), url = URL.createObjectURL(blob); img.onload = () => { URL.revokeObjectURL(url); resolve(img); }; img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This browser could not decode that image.')); }; img.src = url; });
    }
    async function processQueue() {
      if (processing) return; processing = true;
      while (pending.length) {
        const job = pending.shift(); if (job.status === 'cancelled') { cancelled.delete(job.id); continue; } let bitmap;
        try {
          checkCancelled(job); const source = files.find(f => f.id === job.sourceId); if (!source) throw new Error('The source file is no longer in this library.');
          await updateJob(job, { status: 'running', step: 'Decoding image', progress: 20 });
          const blob = await blobFor(source.id); checkCancelled(job); bitmap = await decodeImage(blob); checkCancelled(job);
          const width = bitmap.width || bitmap.naturalWidth, height = bitmap.height || bitmap.naturalHeight;
          if (!width || !height || width * height > 40000000 || width > 16384 || height > 16384) throw new Error('This image exceeds the browser converter’s 40-megapixel or 16,384-pixel edge limit. The original is unchanged.');
          await updateJob(job, { step: `Rendering ${job.format.toUpperCase()}`, progress: 55 });
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('The image converter is unavailable in this browser.');
          if (job.format === 'jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
          ctx.drawImage(bitmap, 0, 0); checkCancelled(job);
          const type = FORMAT_TYPES[job.format], output = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The browser could not encode this image.')), type, .9));
          canvas.width = 1; canvas.height = 1; checkCancelled(job);
          if (output.type !== type) throw new Error(`${job.format.toUpperCase()} export is not supported by this browser. Try PNG instead.`);
          await updateJob(job, { step: 'Saving new version', progress: 90 }); checkCancelled(job);
          const now = Date.now(), id = uid();
          const derivative = { id, name: derivativeName(source.name, job.format), type, size: output.size, createdAt: now, modifiedAt: now, parentId: source.id, rootId: source.rootId || source.id, space: source.space, operation: `Converted to ${job.format.toUpperCase()}`, history: [history('convert', `Created from ${source.name}; ${width} × ${height}`)] };
          // The save transaction is the commit point; cancellation is unavailable while committing.
          job.committing = true; notifyJobs(); await saveFile(derivative, output);
          await updateJob(job, { status: 'completed', progress: 100, step: 'Ready in Files', outputId: id, committing: false }); announce(`${derivative.name} is ready. Your original is safe.`);
        } catch (error) {
          const wasCancelled = error?.name === 'AbortError';
          Object.assign(job, { status: wasCancelled ? 'cancelled' : 'failed', step: wasCancelled ? 'Cancelled' : 'Could not finish', error: wasCancelled ? '' : storageError(error), committing: false, updatedAt: Date.now() });
          try { await saveJob(job); } catch { notifyJobs(); }
          if (!wasCancelled) announce(job.error);
        } finally { bitmap?.close?.(); cancelled.delete(job.id); }
      }
      processing = false;
    }
    async function cancelJob(job) {
      if (!['queued', 'running'].includes(job.status) || job.committing) return;
      cancelled.add(job.id); await updateJob(job, { status: 'cancelled', step: 'Cancelled', error: '' });
    }

    function revokePreview() { previewURLs.forEach(url => URL.revokeObjectURL(url)); previewURLs = []; }
    function objectURL(blob) { const url = URL.createObjectURL(blob); previewURLs.push(url); return url; }
    function mountFiles(rec) {
      const body = rec?.el?.querySelector('.hf-window-body'); if (!body) return;
      if (mount?.body === body) return;
      body.replaceChildren(); body.classList.add('hfiles-body');
      const shell = node('div', 'hfiles-app'), head = node('div', 'hfiles-head'), title = node('div');
      title.append(node('p', 'hfiles-eyebrow', 'YOUR LOCAL LIBRARY'), node('h2', '', 'Make room for ideas.'));
      const input = node('input', 'hfiles-input-file'); input.type = 'file'; input.multiple = true; input.tabIndex = -1; input.setAttribute('aria-label', 'Import files from your device');
      const add = button('Import', 'plus', () => input.click(), 'hfiles-primary'); input.addEventListener('change', () => { importFiles([...input.files]); input.value = ''; });
      head.append(title, add, input);
      const note = node('p', 'hfiles-local-note', 'Stored in this browser · download important originals to keep a backup.');
      const work = node('div', 'hfiles-work'), list = node('div', 'hfiles-list'), preview = node('section', 'hfiles-preview'); list.setAttribute('aria-label', 'Your imported files'); preview.setAttribute('aria-label', 'File preview');
      work.append(list, preview); shell.append(head, note, work); body.append(shell);
      mount = { body, shell, list, preview, add, input };
      let dragDepth = 0;
      shell.addEventListener('dragenter', event => { if ([...event.dataTransfer?.types || []].includes('Files')) { event.preventDefault(); dragDepth++; shell.classList.add('is-dropping'); } });
      shell.addEventListener('dragover', event => { if ([...event.dataTransfer?.types || []].includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
      shell.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; shell.classList.remove('is-dropping'); } });
      shell.addEventListener('drop', event => { event.preventDefault(); dragDepth = 0; shell.classList.remove('is-dropping'); importFiles([...event.dataTransfer.files]); });
      renderFiles();
    }
    function renderFiles() {
      if (!mount?.body.isConnected) return;
      mount.add.disabled = busy || !db; mount.add.querySelector('span').textContent = busy ? 'Importing…' : 'Import';
      mount.list.replaceChildren();
      if (!files.length) {
        const empty = node('div', 'hfiles-empty'); empty.append(icon('folder-plus'), node('h3', '', dbError ? 'Your library needs attention' : 'Your first idea belongs here.'), node('p', 'hfiles-muted', dbError || 'Import images, audio, text, and other files. Drop them here or use Import.'));
        mount.list.append(empty);
      } else {
        if (selectedId && !files.some(f => f.id === selectedId)) selectedId = null;
        getRecent(files.length).forEach(file => {
          const row = node('div', `hfiles-row${file.id === selectedId ? ' is-selected' : ''}`), open = button(file.name, fileIcon(file), () => { if (performance.now() < suppressClickUntil) return; selectedId = file.id; renderFiles(); }, 'hfiles-file-open');
          open.setAttribute('aria-label', `Open ${file.name}`); open.setAttribute('aria-pressed', String(file.id === selectedId));
          const meta = node('small', 'hfiles-file-meta', `${formatBytes(file.size)} · ${file.parentId ? 'Version' : 'Original'}`); open.querySelector('span').append(meta);
          const more = button('Quick tools', 'ellipsis', event => { const r = event.currentTarget.getBoundingClientRect(); openTools({ element: open, file, x: r.right, y: r.bottom }); }, 'hfiles-more'); more.setAttribute('aria-label', `Quick tools for ${file.name}`);
          row.append(open, more); installToolsGesture(open, file); mount.list.append(row);
        });
      }
      renderPreview(); paintIcons();
    }
    async function renderPreview() {
      if (!mount) return; const panel = mount.preview, epoch = ++previewEpoch; revokePreview(); panel.replaceChildren();
      const file = files.find(f => f.id === selectedId);
      if (!file) { panel.append(node('div', 'hfiles-preview-intro', 'A file becomes a starting point.'), node('p', 'hfiles-muted', 'Open a file to preview it. Right-click or hold it for useful tools.')); return; }
      panel.append(node('p', 'hfiles-eyebrow', file.parentId ? 'A NEW VERSION' : 'ORIGINAL'), node('h3', 'hfiles-preview-name', file.name));
      const media = node('div', 'hfiles-media'); media.append(node('p', 'hfiles-muted', 'Opening preview…')); panel.append(media);
      const details = node('p', 'hfiles-muted', `${formatBytes(file.size)} · ${file.type} · ${dateLabel(file.modifiedAt)}`); panel.append(details);
      const contents = blobFor(file.id);
      const actions = node('div', 'hfiles-action-row'); actions.append(downloadLink(file, contents), button('History', 'history', () => showHistory(file)));
      if (RASTER_TYPES.has(file.type)) actions.append(button('Convert', 'wand-sparkles', () => conversionDialog(file)));
      if (file.type.startsWith('audio/')) actions.append(button('Audio tools', 'sliders-horizontal', () => audioTools(file)));
      panel.append(actions); paintIcons();
      try {
        const blob = await contents; if (epoch !== previewEpoch || !panel.isConnected) return; media.replaceChildren();
        if (RASTER_TYPES.has(file.type)) {
          const img = node('img', 'hfiles-image'); img.alt = file.name; img.src = objectURL(blob); media.append(img);
        } else if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
          const player = node(file.type.startsWith('audio/') ? 'audio' : 'video', 'hfiles-player'); player.controls = true; player.preload = 'metadata'; player.src = objectURL(blob); player.setAttribute('aria-label', file.name); media.append(player);
        } else if (file.type.startsWith('text/') || ['application/json', 'application/xml'].includes(file.type)) {
          const text = await blob.slice(0, 60000).text(); if (epoch !== previewEpoch) return; media.append(node('pre', 'hfiles-text-preview', text));
          if (blob.size > 60000) media.append(node('small', 'hfiles-muted', 'Preview shows the first 60 KB. Download contains the complete file.'));
        } else { media.append(icon(fileIcon(file)), node('p', 'hfiles-muted', 'This format is stored safely. Download it to open in a compatible app.')); paintIcons(); }
      } catch (error) { if (epoch === previewEpoch) media.replaceChildren(node('p', 'hfiles-muted', storageError(error))); }
    }
    function openFiles(id) {
      if (typeof id === 'string') selectedId = id;
      closeQuick(false); api.openApp('Files'); const rec = api.windows?.get('Files'); if (rec) mountFiles(rec); renderFiles();
    }

    let suppressClickUntil = 0;
    function installToolsGesture(element, file) {
      let hold = 0, start = null, held = false;
      const cancel = () => { clearTimeout(hold); hold = 0; start = null; if (held) suppressClickUntil = performance.now() + 700; held = false; };
      element.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); cancel(); openTools({ element, file, x: event.clientX, y: event.clientY }); });
      element.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'touch' || event.button !== 0) return;
        start = { x: event.clientX, y: event.clientY }; hold = setTimeout(() => { held = true; suppressClickUntil = performance.now() + 800; openTools({ element, file, x: start.x, y: start.y }); }, 420);
      });
      element.addEventListener('pointermove', event => { if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 9) cancel(); });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => element.addEventListener(type, cancel));
      element.addEventListener('keydown', event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); event.stopPropagation(); const r = element.getBoundingClientRect(); openTools({ element, file, x: r.left, y: r.bottom }); } });
    }
    function closeQuick(restore = true) {
      if (!quick) return; quick.remove(); quick = null; if (restore && quickReturn?.isConnected) quickReturn.focus({ preventScroll: true }); quickReturn = null;
    }
    function openTools({ element, file, x, y }) {
      if (!file) return; closeQuick(false); quickReturn = element || document.activeElement;
      const local = files.find(f => f.id === (file.localId || file.id)), current = local || file;
      quick = node('section', 'hfiles-quick'); quick.setAttribute('role', 'dialog'); quick.setAttribute('aria-label', `Quick tools for ${current.name}`);
      const title = node('div', 'hfiles-quick-title'); title.append(node('strong', '', current.name), node('small', '', local ? 'QUICK TOOLS' : 'WORKSPACE SHORTCUT'));
      const tools = node('div', 'hfiles-quick-row');
      const action = (label, glyph, fn) => tools.append(button(label, glyph, () => { closeQuick(false); fn(); }));
      action('Open', 'arrow-up-right', () => local ? openFiles(local.id) : api.openApp(file.app, element));
      action('Copy name', 'copy', () => copyName(current.name));
      if (local) {
        if (typeof api.pinFile === 'function') action('Place on desktop', 'monitor', () => { try { api.pinFile(local); announce(`${local.name} has a shortcut on your desktop.`); } catch (error) { announce(storageError(error)); } });
        action('Duplicate', 'copy-plus', () => duplicateFile(local)); action('Rename', 'pencil', () => renameFile(local));
        tools.append(downloadLink(local));
        if (RASTER_TYPES.has(local.type)) action('Convert', 'wand-sparkles', () => conversionDialog(local));
        if (local.type.startsWith('audio/')) action('Audio tools', 'sliders-horizontal', () => audioTools(local));
        action('History', 'history', () => showHistory(local)); action('Remove', 'trash-2', () => removeFile(local));
      } else action('Import a file', 'folder-plus', () => openFiles());
      quick.append(title, tools); layer.append(quick); paintIcons();
      const r = os.getBoundingClientRect(), scale = r.width / os.clientWidth || 1, localX = ((x ?? r.left + 20) - r.left) / scale, localY = ((y ?? r.top + 80) - r.top) / scale;
      quick.style.left = `${Math.max(8, Math.min(os.clientWidth - quick.offsetWidth - 8, localX))}px`;
      quick.style.top = `${Math.max(8, Math.min(os.clientHeight - quick.offsetHeight - 8, localY + 8))}px`;
      animate(quick); quick.querySelector('button')?.focus({ preventScroll: true });
    }
    function openOverlay(title, kind) {
      closeQuick(false); closeOverlay(false); overlayReturn = document.activeElement;
      overlay = node('div', 'hfiles-overlay'); overlay.dataset.kind = kind;
      const card = node('section', 'hfiles-dialog'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', title);
      const head = node('header', 'hfiles-dialog-head'), close = button(`Close ${title}`, 'x', () => closeOverlay(), 'hfiles-close'); head.append(node('h2', '', title), close);
      const content = node('div', 'hfiles-dialog-content'); card.append(head, content); overlay.append(card); layer.append(overlay);
      inertRecords = [...os.children].filter(el => el !== layer).map(el => [el, el.inert]); inertRecords.forEach(([el]) => { el.inert = true; });
      overlay.addEventListener('pointerdown', event => { if (event.target === overlay) closeOverlay(); }); animate(card); paintIcons(); head.querySelector('button').focus({ preventScroll: true }); return content;
    }
    function closeOverlay(restore = true) {
      if (!overlay) return; overlay.remove(); overlay = null; inertRecords.forEach(([el, wasInert]) => { el.inert = wasInert; }); inertRecords = [];
      if (restore && overlayReturn?.isConnected) overlayReturn.focus({ preventScroll: true }); overlayReturn = null;
    }
    function showActivity() { openOverlay('Activity', 'activity'); renderActivity(); }
    function renderActivity() {
      const content = overlay?.querySelector('.hfiles-dialog-content'); if (!content || overlay.dataset.kind !== 'activity') return;
      const focusedAction = document.activeElement?.dataset.jobAction, focusedJob = document.activeElement?.dataset.jobId;
      content.replaceChildren(node('p', 'hfiles-muted', 'Real work, happening in this browser. You can leave this panel while a job finishes; keep this tab open.'));
      if (!jobs.length) { const empty = node('div', 'hfiles-empty'); empty.append(icon('sparkles'), node('h3', '', 'A little room for possibility.'), node('p', 'hfiles-muted', 'Import an image in Files, then choose Convert. Its progress and finished version will appear here.'), button('Open Files', 'folder-open', () => { closeOverlay(); openFiles(); })); content.append(empty); }
      getJobs(60).forEach(job => {
        const card = node('article', 'hfiles-job'); card.dataset.status = job.status;
        const head = node('div', 'hfiles-job-head'); head.append(icon(job.status === 'completed' ? 'circle-check' : job.status === 'failed' ? 'circle-alert' : job.status === 'cancelled' ? 'circle-minus' : 'loader-circle'), node('strong', '', job.name));
        const info = node('p', 'hfiles-muted', `${job.step} · ${dateLabel(job.updatedAt)}`); card.append(head, info);
        if (job.status === 'running' || job.status === 'queued') { const progress = node('progress'); progress.max = 100; progress.value = job.progress; progress.setAttribute('aria-label', `${job.name}: ${job.step}`); card.append(progress); }
        if (job.error) card.append(node('p', 'hfiles-job-error', job.error));
        const actions = node('div', 'hfiles-action-row');
        const add = (label, glyph, action, key) => { const b = button(label, glyph, action); b.dataset.jobId = job.id; b.dataset.jobAction = key; actions.append(b); };
        if (job.status === 'completed' && job.outputId && files.some(file => file.id === job.outputId)) add('Open result', 'arrow-up-right', () => { closeOverlay(); openFiles(job.outputId); }, 'open');
        else if (job.status === 'completed' && job.outputId) card.append(node('p', 'hfiles-muted', 'Result removed from the library.'));
        if (['running', 'queued'].includes(job.status) && !job.committing) add('Cancel', 'x', () => cancelJob(job).catch(error => announce(storageError(error))), 'cancel');
        if (['failed', 'cancelled', 'paused'].includes(job.status)) add(job.status === 'paused' ? 'Run again here' : 'Retry', 'rotate-ccw', () => { const source = files.find(f => f.id === job.sourceId); if (source) enqueueConversion(source, job.format); else announce('The source file is no longer in this library.'); }, 'retry');
        card.append(actions); content.append(card);
      }); paintIcons();
      if (focusedJob) (content.querySelector(`[data-job-id="${CSS.escape(focusedJob)}"][data-job-action="${CSS.escape(focusedAction)}"]`) || overlay.querySelector('.hfiles-close'))?.focus({ preventScroll: true });
    }
    const activityButton = button('Activity', 'sparkles', showActivity, 'hfiles-activity-button'); activityButton.setAttribute('aria-label', 'Open activity');
    const topbar = root.querySelector('.hf-topbar'); if (topbar) topbar.append(activityButton);
    function updateActivityButton() { const count = jobs.filter(j => ['running', 'queued'].includes(j.status)).length; activityButton.dataset.active = String(count > 0); activityButton.setAttribute('aria-label', count ? `Open activity, ${count} jobs in progress` : 'Open activity'); }
    root.addEventListener('hole:window-change', event => {
      const { rec, type } = event.detail || {}; if (rec?.app?.name !== 'Files') return;
      if (type === 'close') { ++previewEpoch; revokePreview(); mount = null; } else mountFiles(rec);
    });
    root.addEventListener('pointerdown', event => { if (quick && !quick.contains(event.target)) closeQuick(false); }, true);
    root.addEventListener('keydown', event => {
      if (!overlay && !quick) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); overlay ? closeOverlay() : closeQuick(); return; }
      const region = overlay || quick, focusable = [...region.querySelectorAll('button:not(:disabled), input:not(:disabled), select, a[href]')].filter(el => !el.hidden);
      if (event.key === 'Tab' && focusable.length) { const first = focusable[0], last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
      if (quick && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const current = focusable.indexOf(document.activeElement), next = event.key === 'Home' ? 0 : event.key === 'End' ? focusable.length - 1 : (current + (event.key === 'ArrowLeft' ? -1 : 1) + focusable.length) % focusable.length; focusable[next]?.focus(); }
    }, true);
    window.addEventListener('resize', () => closeQuick(false));
    root.addEventListener('hole:space-change', () => closeQuick(false));
    window.HoleFiles = { openTools, closeTools: closeQuick, openFiles, showActivity, getRecent, getJobs, importFiles, model, ready: null };
    window.HoleFiles.ready = loadStorage();
    api.windows?.forEach(rec => { if (rec.app?.name === 'Files') mountFiles(rec); });
    paintIcons();
  }
  initialize();
  document.addEventListener('hole:ready', initialize);
  window.addEventListener('hole:ready', initialize);
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
})();
