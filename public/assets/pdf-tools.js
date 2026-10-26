/* Qualified local PDF paths: vector marks, and a fresh raster-only redaction export. */
(() => {
  'use strict';
  const MAX_BYTES = 30 * 1024 * 1024, MAX_PAGES = 30, MAX_PIXELS = 24000000;
  function validateMarks(marks, pages, kind) {
    if (!Array.isArray(marks) || marks.length > 200) throw new Error('Use at most 200 marks in one operation.');
    for (const mark of marks) {
      if (!mark || !Number.isInteger(mark.page) || mark.page < 1 || mark.page > pages || !['text', 'ink', 'redact'].includes(mark.type) || kind === 'annotation' && mark.type === 'redact') throw new Error('A PDF mark is invalid.');
      const points = mark.type === 'ink' ? mark.paths?.flat() : [[mark.x, mark.y], [mark.x + (mark.width || 0), mark.y + (mark.height || 0)]];
      if (!Array.isArray(points) || !points.length || points.length > 20000 || points.some(p => !Array.isArray(p) || p.length !== 2 || p.some(n => !Number.isFinite(n) || n < 0 || n > 1))) throw new Error('Keep PDF marks within the visible page.');
      if (mark.type === 'redact' && (!(mark.width > 0) || !(mark.height > 0))) throw new Error('Choose a non-empty redaction area.');
      if (mark.type === 'text' && (typeof mark.text !== 'string' || !mark.text.trim() || mark.text.length > 1000 || !Number.isFinite(mark.size) || mark.size < 8 || mark.size > 48)) throw new Error('A text annotation needs 1–1,000 characters and an 8–48 point size.');
      if (mark.type === 'ink' && (!Array.isArray(mark.paths) || mark.paths.some(p => !Array.isArray(p) || p.length < 2))) throw new Error('Draw a signature with at least one stroke.');
    }
  }
  function createEngine({ pdfLib, pdfjs, canvasFactory, pngBytes, pdfOptions = {} }) {
    const { PDFDocument, StandardFonts, rgb } = pdfLib;
    async function bytes(blob) {
      if (!(blob instanceof Blob) || blob.size > MAX_BYTES) throw new Error('PDF editing supports files up to 30 MB.');
      const data = new Uint8Array(await blob.arrayBuffer());
      if (!new TextDecoder().decode(data.slice(0, 1024)).includes('%PDF-')) throw new Error('This file does not contain a PDF header.'); return data;
    }
    async function load(blob) {
      const task = pdfjs.getDocument({ ...pdfOptions, data: await bytes(blob), isEvalSupported: false, enableXfa: false, stopAtErrors: true });
      task.onPassword = () => task.destroy();
      const doc = await task.promise;
      if (doc.numPages > MAX_PAGES) { await doc.loadingTask.destroy(); throw new Error('PDF editing supports up to 30 pages per document.'); }
      if (doc.isPureXfa) { await doc.loadingTask.destroy(); throw new Error('XFA forms need a compatible PDF application. Your original is unchanged.'); } return doc;
    }
    async function inspect(blob) {
      const doc = await load(blob);
      try { const pages = []; for (let n = 1; n <= doc.numPages; n++) { const page = await doc.getPage(n), v = page.getViewport({ scale: 1 }); pages.push({ number: n, width: v.width, height: v.height, rotation: page.rotate }); } return { pages }; }
      finally { await doc.loadingTask.destroy(); }
    }
    async function render(doc, number, scale = 1.25) {
      const page = await doc.getPage(number), viewport = page.getViewport({ scale });
      if (viewport.width * viewport.height > MAX_PIXELS || viewport.width > 16000 || viewport.height > 16000) throw new Error('This page exceeds the local rendering limit.');
      const canvas = canvasFactory(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport, background: '#ffffff', intent: 'print' }).promise;
      return { canvas, width: viewport.width / scale, height: viewport.height / scale };
    }
    async function renderPage(blob, number, scale) { const doc = await load(blob); try { return await render(doc, number, scale); } finally { await doc.loadingTask.destroy(); } }
    async function annotate(blob, marks) {
      const doc = await PDFDocument.load(await bytes(blob), { ignoreEncryption: false, updateMetadata: false });
      if (doc.getPageCount() > MAX_PAGES) throw new Error('PDF editing supports up to 30 pages.');
      validateMarks(marks, doc.getPageCount(), 'annotation'); const font = await doc.embedFont(StandardFonts.Helvetica);
      for (const mark of marks) {
        const page = doc.getPage(mark.page - 1), { width, height } = page.getSize();
        if ((page.getRotation().angle % 360 + 360) % 360 !== 0) throw new Error('Vector annotations currently require an unrotated page. Redaction export supports visible page rotation.');
        if (mark.type === 'text') {
          try { font.encodeText(mark.text); } catch { throw new Error('This annotation font supports Latin text. Use a compatible document tool for other scripts; your original is unchanged.'); }
          const lines = mark.text.split('\n'), available = width * (1 - mark.x) - 4;
          if (lines.some(line => font.widthOfTextAtSize(line, mark.size) > available) || mark.y * height + lines.length * mark.size * 1.3 > height) throw new Error('The note will not fit at that position. Shorten it, insert line breaks, or reduce its size.');
          page.drawText(mark.text, { x: mark.x * width, y: height - mark.y * height - mark.size, size: mark.size, lineHeight: mark.size * 1.3, font, color: rgb(.18, .13, .28) });
        } else for (const path of mark.paths) for (let i = 1; i < path.length; i++) page.drawLine({ start: { x: path[i - 1][0] * width, y: height - path[i - 1][1] * height }, end: { x: path[i][0] * width, y: height - path[i][1] * height }, thickness: 1.4, color: rgb(.12, .12, .18) });
      }
      return new Blob([await doc.save()], { type: 'application/pdf' });
    }
    async function redact(blob, marks, { signal, onProgress = () => {} } = {}) {
      const source = await load(blob), result = await PDFDocument.create();
      try {
        validateMarks(marks, source.numPages, 'redaction'); if (!marks.length || marks.some(m => m.type !== 'redact')) throw new Error('Choose at least one redaction rectangle.');
        for (let n = 1; n <= source.numPages; n++) {
          if (signal?.aborted) throw new DOMException('Cancelled before publication', 'AbortError');
          const { canvas, width, height } = await render(source, n, 2), ctx = canvas.getContext('2d');
          for (const mark of marks.filter(m => m.page === n)) {
            const x = Math.max(0, Math.floor(mark.x * canvas.width) - 1), y = Math.max(0, Math.floor(mark.y * canvas.height) - 1);
            const right = Math.min(canvas.width, Math.ceil((mark.x + mark.width) * canvas.width) + 1), bottom = Math.min(canvas.height, Math.ceil((mark.y + mark.height) * canvas.height) + 1);
            ctx.fillStyle = '#000'; ctx.fillRect(x, y, right - x, bottom - y);
          }
          const png = await pngBytes(canvas), image = await result.embedPng(png), page = result.addPage([width, height]);
          page.drawImage(image, { x: 0, y: 0, width, height }); canvas.width = canvas.height = 1;
          onProgress(n / source.numPages);
        }
        if (signal?.aborted) throw new DOMException('Cancelled before publication', 'AbortError');
        result.setTitle('Redacted document'); result.setProducer('Hole OS · raster redaction');
        const output = new Blob([await result.save()], { type: 'application/pdf' });
        const verify = await load(output);
        try {
          for (let n = 1; n <= verify.numPages; n++) { const page = await verify.getPage(n); if ((await page.getTextContent()).items.length || (await page.getAnnotations({ intent: 'any' })).length) throw new Error('The redacted export did not pass content validation.'); }
          if (await verify.getAttachments() || await verify.getJSActions()) throw new Error('The redacted export contains unexpected active or attached content.');
        } finally { await verify.loadingTask.destroy(); }
        return output;
      } finally { await source.loadingTask.destroy(); }
    }
    return Object.freeze({ inspect, renderPage, annotate, redact });
  }
  globalThis.HolePDFModel = Object.freeze({ createEngine, validateMarks, MAX_BYTES, MAX_PAGES });
  if (typeof document === 'undefined') return;
  const base = new URL('vendor/pdf/', document.currentScript.src); let engines;
  async function engine() {
    if (!engines) engines = (async () => {
      if (!window.PDFLib) await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = new URL('pdf-lib-1.17.1.min.js', base).href; script.onload = resolve; script.onerror = () => reject(new Error('The local PDF engine could not load.')); document.head.append(script); });
      const pdfjs = await import(new URL('pdf.min.mjs', base).href); pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', base).href;
      return createEngine({ pdfLib: window.PDFLib, pdfjs, canvasFactory: (width, height) => { const c = document.createElement('canvas'); c.width = width; c.height = height; return c; }, pngBytes: canvas => new Promise((resolve, reject) => canvas.toBlob(async blob => blob ? resolve(new Uint8Array(await blob.arrayBuffer())) : reject(new Error('Could not encode a page image.')), 'image/png')), pdfOptions: { cMapUrl: new URL('cmaps/', base).href, cMapPacked: true, standardFontDataUrl: new URL('standard_fonts/', base).href, wasmUrl: new URL('wasm/', base).href, iccUrl: new URL('iccs/', base).href } });
    })().catch(e => { engines = null; throw e; }); return engines;
  }
  async function edit(ctx, original) {
    const d = ctx.modal('PDF workbench', 'Text annotations and drawn signatures create an annotated version. A redacted copy is rebuilt from page images: text search, forms, links, attachments, and digital signatures are removed. The private original remains in Hole.');
    d.classList.add('he-pdf-dialog'); const feedback = ctx.el('p', 'hc-status', 'Opening the local PDF engine…'); feedback.setAttribute('role', 'status'); d.append(feedback);
    let current = original, busy = false, marks = [], selectedPage = 1, previewEpoch = 0;
    const closeModal = () => new Promise(resolve => { if (!d.open) { resolve(); return; } d.addEventListener('close', () => setTimeout(resolve, 0), { once: true }); d.close(); });
    let closeRequested = closeModal;
    d.append(ctx.button('Close PDF workbench', 'x', () => closeRequested()));
    let pdf, info;
    try { pdf = await engine(); info = await pdf.inspect(original.blob); }
    catch (error) { if (!d.open || !d.isConnected) return; feedback.textContent = error.message + ' Your original is unchanged.'; d.append(ctx.button('Retry PDF tools', 'rotate-cw', async () => { await closeModal(); return edit(ctx, original); })); ctx.H.icons(); return; }
    if (!d.open || !d.isConnected) return;
    let draft;
    try { draft = await window.HoleEverydayModel.draftSession(ctx.C, 'paper-pdf:' + original.asset.id, { marks: [], baseVersionId: original.version.id }, message => { feedback.textContent = message; });
      if (draft.recovered) { marks = draft.value.marks; current = await ctx.C.readAsset(original.asset.id, draft.value.baseVersionId); feedback.textContent = 'Recovered PDF marks saved locally'; }
    } catch (error) { feedback.textContent = 'The saved PDF draft could not be opened: ' + error.message; return; }
    if (!d.open || !d.isConnected) return;
    const preview = ctx.el('div', 'he-pdf-preview'), select = ctx.el('select', 'hc-input'); select.setAttribute('aria-label', 'PDF page');
    for (const p of info.pages) { const o = ctx.el('option', '', 'Page ' + p.number + ' · ' + Math.round(p.width) + ' × ' + Math.round(p.height) + ' pt'); o.value = p.number; select.append(o); }
    const x = ctx.input('Left position (0–100%)', 'number', '10'), y = ctx.input('Top position (0–100%)', 'number', '10'), width = ctx.input('Width (0–100%)', 'number', '40'), height = ctx.input('Height (0–100%)', 'number', '10');
    for (const f of [x, y, width, height]) { f.input.min = '0'; f.input.max = '100'; f.input.step = '.1'; }
    const note = ctx.input('Annotation text (Latin characters)', 'textarea', ''), size = ctx.input('Text size (points)', 'number', '14'); size.input.min = '8'; size.input.max = '48';
    const list = ctx.el('div', 'he-pdf-marks');
    const rect = () => ({ page: selectedPage, x: Number(x.input.value) / 100, y: Number(y.input.value) / 100, width: Number(width.input.value) / 100, height: Number(height.input.value) / 100 });
    async function draw() {
      const epoch = ++previewEpoch, rendered = await pdf.renderPage(current.blob, selectedPage, 1.15); if (!d.isConnected || epoch !== previewEpoch) return;
      const canvas = rendered.canvas, cx = canvas.getContext('2d'); canvas.className = 'he-pdf-canvas'; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Page ' + selectedPage + ' with proposed marks');
      for (const m of marks.filter(m => m.page === selectedPage)) {
        if (m.type === 'redact') { cx.fillStyle = '#000'; cx.fillRect(m.x * canvas.width, m.y * canvas.height, m.width * canvas.width, m.height * canvas.height); }
        else if (m.type === 'text') { cx.fillStyle = '#302040'; cx.font = `${m.size * 1.15}px sans-serif`; cx.textBaseline = 'top'; m.text.split('\n').forEach((line, i) => cx.fillText(line, m.x * canvas.width, m.y * canvas.height + i * m.size * 1.3 * 1.15)); }
        else { cx.strokeStyle = '#202030'; cx.lineWidth = 1.6; for (const path of m.paths) { cx.beginPath(); path.forEach(([px, py], i) => i ? cx.lineTo(px * canvas.width, py * canvas.height) : cx.moveTo(px * canvas.width, py * canvas.height)); cx.stroke(); } }
      }
      preview.replaceChildren(canvas);
      list.replaceChildren(); marks.forEach((mark, index) => list.append(ctx.button('Remove ' + mark.type + ' on page ' + mark.page, 'x', () => { marks.splice(index, 1); saveMarks(); draw().catch(ctx.fail); })));
    }
    function saveMarks() { draft.save({ marks, baseVersionId: current.version.id }); }
    function add(mark) { validateMarks([mark], info.pages.length); marks.push(mark); saveMarks(); draw().catch(ctx.fail); }
    select.addEventListener('change', () => { selectedPage = Number(select.value); draw().catch(ctx.fail); });
    const signature = ctx.el('canvas', 'he-signature-pad'); signature.width = 600; signature.height = 180; signature.setAttribute('aria-label', 'Draw your signature here; use annotation text as the keyboard alternative'); signature.tabIndex = 0;
    const sc = signature.getContext('2d'); let paths = [], stroke = null;
    const point = e => { const r = signature.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
    signature.addEventListener('pointerdown', e => { e.preventDefault(); signature.setPointerCapture(e.pointerId); stroke = [point(e)]; paths.push(stroke); });
    signature.addEventListener('pointermove', e => { if (!stroke) return; e.preventDefault(); const p = point(e), last = stroke.at(-1); stroke.push(p); sc.beginPath(); sc.moveTo(last[0] * 600, last[1] * 180); sc.lineTo(p[0] * 600, p[1] * 180); sc.stroke(); });
    for (const type of ['pointerup', 'pointercancel']) signature.addEventListener(type, () => { stroke = null; });
    const consent = ctx.el('label', 'hc-label'), confirm = ctx.el('input'); confirm.type = 'checkbox'; consent.append(confirm, ctx.el('span', '', 'I reviewed every redaction area and accept an image-only PDF without searchable text, forms, links, attachments, or verified signatures.'));
    const renderControls = ctx.el('div', 'hc-row'); renderControls.append(x.wrap, y.wrap, width.wrap, height.wrap);
    async function commit(redaction) {
      if (busy) return;
      const selected = marks.filter(m => redaction ? m.type === 'redact' : m.type !== 'redact');
      if (!selected.length) throw new Error('Add at least one ' + (redaction ? 'redaction area.' : 'annotation or signature.'));
      if (redaction && !confirm.checked) throw new Error('Review and accept the image-only export before generating it.');
      busy = true; feedback.textContent = 'Rendering actual PDF output…';
      let job;
      try {
        job = await ctx.C.put('jobs', { id: crypto.randomUUID(), name: redaction ? 'Redacted PDF export' : 'PDF annotations', status: 'running', progress: 0, inputs: [{ assetId: current.asset.id, versionId: current.version.id }] });
        await draft.flush(); const annotationMarks = marks.filter(m => m.type !== 'redact');
        const input = redaction && annotationMarks.length ? await pdf.annotate(current.blob, annotationMarks) : current.blob;
        const blob = redaction ? await pdf.redact(input, selected, { onProgress: p => { feedback.textContent = 'Rendering pages · ' + Math.round(p * 100) + '%'; } }) : await pdf.annotate(input, selected);
        const output = redaction ? { name: current.asset.name.replace(/\.pdf$/i, '') + ' redacted.pdf', blob, kind: 'pdf', projectId: current.asset.projectId, parentVersionIds: [current.version.id], operation: 'pdf-raster-redaction', parameters: { scale: 2, regions: selected }, provenance: { sourceAssetId: current.asset.id, sourceVersionId: current.version.id, imageOnly: true } } : { assetId: current.asset.id, baseVersionId: current.version.id, blob, operation: 'pdf-annotate', parameters: { marks: selected } };
        const saved = await ctx.C.commitJobOutputs({ jobId: job.id, idempotencyKey: job.id, outputs: [output] });
        const result = saved.outputs[0]; ctx.download(blob, result.asset.name);
        if (!redaction) current = await ctx.C.readAsset(current.asset.id);
        marks = redaction ? [] : marks.filter(m => !selected.includes(m)); await draft.clear(); if (marks.length) saveMarks();
        feedback.textContent = redaction ? 'Redacted copy saved and downloaded. All page text layers and attachments were removed; the private original remains in Hole.' : 'Annotated version saved and downloaded. A drawn signature is not a verified digital signature.';
        await draw();
      } catch (e) { feedback.textContent = e.message; if (job) { try { const latest = await ctx.C.get('jobs', job.id); if (latest && latest.status !== 'completed') await ctx.C.put('jobs', { ...latest, status: 'failed', error: e.message }, { expectedRevision: latest.revision }); } catch (storageError) { feedback.textContent += ' The job status could not be saved: ' + storageError.message; } } }
      finally { busy = false; }
    }
    d.append(select, preview, renderControls, note.wrap, size.wrap, ctx.button('Add text annotation', 'type', () => add({ type: 'text', page: selectedPage, x: Number(x.input.value) / 100, y: Number(y.input.value) / 100, text: note.input.value, size: Number(size.input.value) })), ctx.el('p', '', 'Drawn signature · not a verified digital signature. Position and size use the controls above.'), signature, ctx.button('Clear signature drawing', 'eraser', () => { paths = []; sc.clearRect(0, 0, 600, 180); }), ctx.button('Place drawn signature', 'pen', () => { const r = rect(); add({ type: 'ink', page: selectedPage, paths: paths.filter(p => p.length > 1).map(path => path.map(([px, py]) => [r.x + px * r.width, r.y + py * r.height])) }); }), ctx.button('Add redaction area', 'square', () => add({ ...rect(), type: 'redact' })), list, ctx.button('Save annotated version', 'save', () => commit(false), 'hc-primary'), consent, ctx.button('Generate redacted copy', 'file-lock', () => commit(true)), ctx.button('Close', 'x', () => closeRequested()));
    d.addEventListener('cancel', e => { if (busy || draft.pending || draft.failed) { e.preventDefault(); feedback.textContent = 'Keep this view open until the PDF marks are saved.'; } });
    closeRequested = async () => { if (busy) { feedback.textContent = 'Wait for the PDF output to finish.'; return; } try { await draft.flush(); await closeModal(); await ctx.render(); } catch (e) { feedback.textContent = e.message; } };
    const unload = event => { if (busy || draft.pending || draft.failed) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', unload); d.addEventListener('close', () => window.removeEventListener('beforeunload', unload), { once: true });
    if (!draft.recovered) feedback.textContent = 'Choose a page, place marks, and review the actual preview before saving.'; try { await draw(); } catch (error) { feedback.textContent = error.message + ' Your original is unchanged.'; } ctx.H.icons();
  }
  window.HolePDF = Object.freeze({ edit, engine, model: globalThis.HolePDFModel });
})();
