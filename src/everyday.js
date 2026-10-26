/* Everyday work uses the same durable objects and versions as the rest of Hole. */
(() => {
  'use strict';
  const DOC_MIME = 'text/markdown', SHEET_MIME = 'application/vnd.hole.sheet+json', FORM_MIME = 'application/vnd.hole.form+json';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const json = (data, mime) => new Blob([JSON.stringify(data, null, 2)], { type: mime });
  const uid = () => crypto.randomUUID();
  const safeName = value => String(value || 'Untitled').replace(/[\u0000-\u001f/\\]/g, '').slice(0, 160);
  function zoneParts(at, timeZone) {
    return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(at).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  }
  function wallTimeToInstant(value, timeZone, disambiguation = 'reject') {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (!match) throw new Error('Choose a valid date and time.');
    const [, ys, ms, ds, hs, mins] = match, y = Number(ys), m = Number(ms), d = Number(ds), h = Number(hs), min = Number(mins);
    const guess = Date.UTC(y, m - 1, d, h, min);
    if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || h > 23 || min > 59 || new Date(guess).getUTCDate() !== d) throw new Error('Choose a valid date between 1900 and 2200.');
    const candidates = new Set();
    for (const delta of [-172800000, 0, 172800000]) {
      const sample = guess + delta, p = zoneParts(sample, timeZone), offset = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - sample;
      const at = guess - offset, actual = zoneParts(at, timeZone);
      if (`${actual.year}-${actual.month}-${actual.day}T${actual.hour}:${actual.minute}` === value) candidates.add(at);
    }
    const matches = [...candidates].sort((a, b) => a - b);
    if (!matches.length) throw new Error('That local time does not exist because the clocks change. Choose another time.');
    if (matches.length > 1 && !['earlier', 'later'].includes(disambiguation)) throw new Error('That time occurs twice as clocks change. Choose the earlier or later occurrence.');
    return disambiguation === 'later' ? matches.at(-1) : matches[0];
  }
  function validateEvent(input) {
    if (!input.name?.trim()) throw new Error('Give this event a name.');
    const startAt = wallTimeToInstant(input.startLocal, input.timeZone, input.disambiguation), endAt = wallTimeToInstant(input.endLocal, input.timeZone, input.disambiguation);
    if (endAt <= startAt) throw new Error('The end must be after the start.');
    return { ...input, name: input.name.trim().slice(0, 160), startAt, endAt };
  }
  const icsText = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const utcStamp = at => new Date(at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  function foldICS(line) {
    let result = '', segment = '', bytes = 0;
    for (const char of line) { const n = new TextEncoder().encode(char).length; if (bytes + n > 74) { result += segment + '\r\n'; segment = ' '; bytes = 1; } segment += char; bytes += n; }
    return result + segment;
  }
  function calendarICS(events, exportedAt = Date.now()) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hole OS//Day//EN', 'CALSCALE:GREGORIAN'];
    for (const e of events) {
      if (!Number.isFinite(e.startAt) || !Number.isFinite(e.endAt) || e.endAt <= e.startAt) throw new Error('An event has invalid saved dates. Edit it before exporting.');
      lines.push('BEGIN:VEVENT', 'UID:' + icsText(e.id) + '@hole.local', 'DTSTAMP:' + utcStamp(exportedAt), 'DTSTART:' + utcStamp(e.startAt), 'DTEND:' + utcStamp(e.endAt), 'SUMMARY:' + icsText(e.name), 'DESCRIPTION:' + icsText((e.notes || '') + '\nTime zone: ' + e.timeZone), 'X-HOLE-TIMEZONE:' + icsText(e.timeZone), 'END:VEVENT');
    }
    lines.push('END:VCALENDAR'); return lines.map(foldICS).join('\r\n') + '\r\n';
  }
  function inlineMarkdown(value) {
    return escape(value).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
  }
  function documentHTML(markdown, title = 'Document', standalone = true) {
    if (typeof markdown !== 'string' || markdown.length > 500000) throw new Error('Keep a document below 500,000 characters.');
    const paragraphs = markdown.split(/\r?\n/).map(line => {
      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading) return `<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`;
      if (/^>\s?/.test(line)) return '<blockquote>' + inlineMarkdown(line.replace(/^>\s?/, '')) + '</blockquote>';
      if (/^[-*]\s+/.test(line)) return '<p class="list-item">• ' + inlineMarkdown(line.replace(/^[-*]\s+/, '')) + '</p>';
      return line ? '<p>' + inlineMarkdown(line) + '</p>' : '<br>';
    }).join('\n');
    return standalone ? `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title><style>body{font:18px/1.65 system-ui,sans-serif;max-width:760px;padding:32px;margin:auto;color:#20252a}h1,h2,h3{line-height:1.2}blockquote{border-left:3px solid #999;padding-left:16px}code{background:#eee;padding:2px 4px}.list-item{padding-left:16px}@media print{body{padding:0}}</style></head><body>${paragraphs}</body></html>` : paragraphs;
  }
  function cellAddress(token) {
    const m = /^([A-Z]{1,2})([1-9]\d{0,2})$/.exec(token); if (!m) throw new Error('#REF!');
    let column = 0; for (const char of m[1]) column = column * 26 + char.charCodeAt(0) - 64;
    return [+m[2] - 1, column - 1];
  }
  function validateSheet(sheet) {
    if (!sheet || sheet.version !== 1 || !Array.isArray(sheet.cells) || !sheet.cells.length || sheet.cells.length > 100 || sheet.cells.some(row => !Array.isArray(row) || !row.length || row.length > 26 || row.some(cell => typeof cell !== 'string' || cell.length > 10000))) throw new Error('A table supports 1–100 rows and 1–26 columns of text and formulas.');
    return sheet;
  }
  function evaluateSheet(sheet) {
    validateSheet(sheet); const cache = new Map(), visiting = new Set();
    function cell(r, c) {
      if (r < 0 || r >= sheet.cells.length || c < 0 || c >= sheet.cells[r].length) throw new Error('#REF!');
      const key = r + ':' + c; if (cache.has(key)) return cache.get(key); if (visiting.has(key)) throw new Error('#CYCLE!');
      const raw = sheet.cells[r][c]; if (!raw.startsWith('=')) return raw;
      visiting.add(key);
      try {
        const src = raw.slice(1).toUpperCase(), tokens = []; const re = /\s*(SUM|AVERAGE|[A-Z]{1,2}[1-9]\d{0,2}|(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/,:])\s*/gy;
        let position = 0, m; while (position < src.length && (re.lastIndex = position, m = re.exec(src))) { tokens.push(m[1]); position = re.lastIndex; }
        if (position !== src.length || tokens.length > 300) throw new Error('#FORMULA!'); let i = 0;
        const numeric = value => { if (Array.isArray(value) || value !== '' && !Number.isFinite(Number(value))) throw new Error('#VALUE!'); return Number(value); };
        const atom = () => {
          const token = tokens[i++];
          if (token === '+' || token === '-') return (token === '-' ? -1 : 1) * numeric(atom());
          if (token === '(') { const v = expr(); if (tokens[i++] !== ')') throw new Error('#FORMULA!'); return v; }
          if (token === 'SUM' || token === 'AVERAGE') {
            if (tokens[i++] !== '(') throw new Error('#FORMULA!'); const values = [];
            if (tokens[i] !== ')') do { values.push(...[expr()].flat()); } while (tokens[i] === ',' && ++i);
            if (tokens[i++] !== ')') throw new Error('#FORMULA!'); const nums = values.filter(v => v !== '').map(numeric);
            if (!nums.length && token === 'AVERAGE') throw new Error('#DIV/0!'); return nums.reduce((sum, n) => sum + n, 0) / (token === 'AVERAGE' ? nums.length : 1);
          }
          if (/^[A-Z]/.test(token || '')) {
            const [r, c] = cellAddress(token);
            if (tokens[i] === ':') { i++; const [er, ec] = cellAddress(tokens[i++]); if (er < r || ec < c || (er - r + 1) * (ec - c + 1) > 2600) throw new Error('#REF!'); const values = []; for (let row = r; row <= er; row++) for (let col = c; col <= ec; col++) values.push(cell(row, col)); return values; }
            return cell(r, c);
          }
          if (!token || !Number.isFinite(Number(token))) throw new Error('#FORMULA!'); return Number(token);
        };
        const product = () => { let value = atom(); while (['*', '/'].includes(tokens[i])) { const op = tokens[i++], rhs = numeric(atom()); if (op === '/' && rhs === 0) throw new Error('#DIV/0!'); value = op === '*' ? numeric(value) * rhs : numeric(value) / rhs; } return value; };
        const expr = () => { let value = product(); while (['+', '-'].includes(tokens[i])) { const op = tokens[i++], rhs = numeric(product()); value = op === '+' ? numeric(value) + rhs : numeric(value) - rhs; } return value; };
        const value = numeric(expr()); if (i !== tokens.length || !Number.isFinite(value)) throw new Error('#FORMULA!'); cache.set(key, value); return value;
      } finally { visiting.delete(key); }
    }
    return sheet.cells.map((row, r) => row.map((_, c) => { try { return cell(r, c); } catch (e) { return e.message; } }));
  }
  function sheetCSV(sheet) { return evaluateSheet(sheet).map(row => row.map(value => { let text = String(value); if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; }).join(',')).join('\r\n'); }
  function validateForm(form) {
    if (!form || form.version !== 1 || !Array.isArray(form.fields) || !form.fields.length || form.fields.length > 30 || !Array.isArray(form.responses)) throw new Error('A form needs 1–30 questions.');
    const ids = new Set();
    for (const f of form.fields) { if (typeof f.id !== 'string' || ids.has(f.id) || !f.label?.trim() || !['text', 'email', 'number', 'date', 'checkbox'].includes(f.type)) throw new Error('A form question is invalid.'); ids.add(f.id); }
    if (form.responses.length > 1000) throw new Error('Export responses before adding more than 1,000.'); return form;
  }
  function formResponse(form, input, at = Date.now()) {
    validateForm(form); const values = {};
    for (const f of form.fields) {
      const v = f.type === 'checkbox' ? !!input[f.id] : String(input[f.id] ?? '').trim().slice(0, 10000);
      if (f.required && !v) throw new Error('Complete “' + f.label + '”.');
      if (v && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error('Enter a valid email for “' + f.label + '”.');
      if (v && f.type === 'number' && !Number.isFinite(Number(v))) throw new Error('Enter a number for “' + f.label + '”.');
      if (v && f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Enter a date for “' + f.label + '”.'); values[f.id] = v;
    }
    return { id: uid(), at, values };
  }
  async function draftSession(core, id, initial, onStatus = () => {}) {
    let record = await core.get('settings', id), value = record?.value || initial, pending = 0, failed = false, queue = Promise.resolve();
    return {
      get value() { return value; }, get pending() { return pending; }, get failed() { return failed; }, get recovered() { return !!record; },
      save(next) {
        value = structuredClone(next); const snapshot = structuredClone(next); pending++; onStatus('Saving draft…');
        queue = queue.catch(() => {}).then(async () => { record = await core.put('settings', { id, value: snapshot }, { expectedRevision: record?.revision || 0 }); failed = false; onStatus('Draft saved locally'); }).catch(e => { failed = true; onStatus(e.message); throw e; }).finally(() => { pending--; });
        queue.catch(() => {}); return queue;
      },
      flush: () => queue,
      async clear() { await queue; if (record) await core.deleteRecord('settings', id, { expectedRevision: record.revision }); record = null; }
    };
  }
  const model = Object.freeze({ DOC_MIME, SHEET_MIME, FORM_MIME, wallTimeToInstant, validateEvent, calendarICS, documentHTML, validateSheet, evaluateSheet, sheetCSV, validateForm, formResponse, draftSession });
  globalThis.HoleEverydayModel = model;
  if (typeof document === 'undefined') return;

  function protectDraft(dialog, draft) {
    const leaving = event => { if (draft.pending || draft.failed) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leaving); dialog.addEventListener('close', () => window.removeEventListener('beforeunload', leaving), { once: true });
  }

  async function saveObject(ctx, existing, title, blob, kind, operation) {
    return existing ? ctx.C.commitAsset({ assetId: existing.asset.id, baseVersionId: existing.version.id, name: title, blob, operation }) : ctx.C.importAsset({ name: title, blob, kind, projectId: ctx.navigation.projectId || null, spaceId: ctx.navigation.spaceId === 'overview' ? 'desk' : ctx.navigation.spaceId, provenance: { app: 'Paperwork' } });
  }
  function projectSelect(ctx, projects, selected) {
    const wrap = ctx.el('label', 'hc-label', 'Linked project'), select = ctx.el('select', 'hc-input');
    const none = ctx.el('option', '', 'No project'); none.value = ''; select.append(none);
    for (const p of projects) { const o = ctx.el('option', '', p.name); o.value = p.id; select.append(o); }
    select.value = selected || ''; wrap.append(select); return { wrap, select };
  }
  async function eventDialog(ctx, existing = null) {
    const d = ctx.modal(existing ? 'Edit event' : 'Make room in your day.', 'Times are saved with an explicit time zone. External calendar sync is not connected.');
    const title = ctx.input('Event', 'text', existing?.name || ''), start = ctx.input('Starts', 'datetime-local', existing?.startLocal || ''), end = ctx.input('Ends', 'datetime-local', existing?.endLocal || ''), zone = ctx.input('IANA time zone', 'text', existing?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone), notes = ctx.input('Notes', 'textarea', existing?.notes || '');
    const ambiguity = ctx.el('select', 'hc-input'); ambiguity.setAttribute('aria-label', 'If the clock repeats this time'); for (const [value, label] of [['reject', 'Ask if this time occurs twice'], ['earlier', 'Use the earlier occurrence'], ['later', 'Use the later occurrence']]) { const o = ctx.el('option', '', label); o.value = value; ambiguity.append(o); } ambiguity.value = existing?.disambiguation || 'reject';
    const project = projectSelect(ctx, await ctx.C.list('projects'), existing?.projectId || ctx.navigation.projectId); const feedback = ctx.el('p', 'hc-status'); feedback.setAttribute('role', 'status');
    d.append(title.wrap, start.wrap, end.wrap, zone.wrap, ambiguity, project.wrap, notes.wrap, feedback, ctx.button('Save event', 'check', async () => {
      try { const data = validateEvent({ ...(existing || {}), id: existing?.id || uid(), name: title.input.value, startLocal: start.input.value, endLocal: end.input.value, timeZone: zone.input.value.trim(), disambiguation: ambiguity.value, notes: notes.input.value, projectId: project.select.value || null }); await ctx.put('events', data); d.close(); await ctx.render(); } catch (e) { feedback.textContent = e.message; }
    }, 'hc-primary'), ctx.button('Cancel', 'x', () => d.close())); title.input.focus(); ctx.H.icons();
  }
  async function taskDialog(ctx, existing = null) {
    const d = ctx.modal(existing ? 'Edit task' : 'A next step.'), name = ctx.input('Task', 'text', existing?.name || ''), due = ctx.input('Due date (optional)', 'date', existing?.dueDate || ''), notes = ctx.input('Notes', 'textarea', existing?.notes || '');
    const project = projectSelect(ctx, await ctx.C.list('projects'), existing?.projectId || ctx.navigation.projectId);
    const feedback = ctx.el('p', 'hc-status'); feedback.setAttribute('role', 'status');
    d.append(name.wrap, due.wrap, notes.wrap, project.wrap, feedback, ctx.button('Save task', 'check', async () => { if (!name.input.value.trim()) { feedback.textContent = 'Give the task a name.'; return; } try { await ctx.put('tasks', { ...(existing || {}), id: existing?.id || uid(), name: name.input.value.trim().slice(0, 200), notes: notes.input.value, dueDate: due.input.value || null, done: !!existing?.done, projectId: project.select.value || null }); d.close(); await ctx.render(); } catch (e) { feedback.textContent = e.message; } }, 'hc-primary'), ctx.button('Cancel', 'x', () => d.close())); name.input.focus(); ctx.H.icons();
  }
  async function contactDialog(ctx, existing = null) {
    const d = ctx.modal(existing ? 'Edit contact' : 'Someone close at hand.', 'A local address book. This does not send messages or synchronize with a provider.');
    const name = ctx.input('Name', 'text', existing?.name || ''), email = ctx.input('Email', 'email', existing?.email || ''), phone = ctx.input('Phone', 'tel', existing?.phone || ''), notes = ctx.input('Notes', 'textarea', existing?.notes || ''), project = projectSelect(ctx, await ctx.C.list('projects'), existing?.projectId || ctx.navigation.projectId), feedback = ctx.el('p', 'hc-status');
    d.append(name.wrap, email.wrap, phone.wrap, notes.wrap, project.wrap, feedback, ctx.button('Save contact', 'check', async () => { if (!name.input.value.trim() || email.input.value && !email.input.validity.valid) { feedback.textContent = 'Enter a name and a valid email, or leave email blank.'; return; } try { await ctx.put('contacts', { ...(existing || {}), id: existing?.id || uid(), name: name.input.value.trim(), email: email.input.value, phone: phone.input.value, notes: notes.input.value, projectId: project.select.value || null }); d.close(); await ctx.render(); } catch (e) { feedback.textContent = e.message; } }, 'hc-primary'), ctx.button('Cancel', 'x', () => d.close())); name.input.focus(); ctx.H.icons();
  }
  async function day(ctx) {
    const [events, tasks, contacts, projects] = await Promise.all(['events', 'tasks', 'contacts', 'projects'].map(type => ctx.C.list(type)));
    ctx.title('DAY', 'Now, next, whenever.', 'Your plans and people, with room to breathe.', [ctx.button('Add event', 'calendar-plus', () => eventDialog(ctx), 'hc-primary'), ctx.button('Add task', 'plus', () => taskDialog(ctx))]);
    const agenda = ctx.section('On the calendar');
    for (const event of events.sort((a, b) => a.startAt - b.startAt)) {
      const row = ctx.el('article', 'hc-note he-agenda-row'); const display = new Intl.DateTimeFormat([], { timeZone: event.timeZone, dateStyle: 'medium', timeStyle: 'short' });
      const body = ctx.el('div'); body.append(ctx.el('strong', '', event.name), ctx.el('p', '', display.format(event.startAt) + ' — ' + display.format(event.endAt)), ctx.el('small', '', event.timeZone));
      row.append(body, ctx.button('Edit ' + event.name, 'pencil', () => eventDialog(ctx, event))); if (event.projectId) row.append(ctx.button('Open project', 'folder', () => ctx.open('projects', { projectId: event.projectId, assetId: null }))); agenda.append(row);
    }
    if (!events.length) agenda.append(ctx.empty('Nothing scheduled yet. Add an event in its own time zone.'));
    agenda.append(ctx.button('Export calendar (.ics)', 'download', () => ctx.download(new Blob([calendarICS(events)], { type: 'text/calendar;charset=utf-8' }), 'Hole-Day.ics')));
    const checklist = ctx.section('Next steps');
    for (const task of tasks.sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate || 'z').localeCompare(b.dueDate || 'z'))) {
      const row = ctx.el('div', 'hc-note he-task-row'), check = ctx.el('input'); check.type = 'checkbox'; check.checked = task.done; check.setAttribute('aria-label', 'Complete ' + task.name);
      check.addEventListener('change', async () => { check.disabled = true; try { await ctx.put('tasks', { ...task, done: check.checked }); await ctx.render(); } catch (e) { check.checked = task.done; ctx.fail(e); } finally { check.disabled = false; } });
      row.append(check, ctx.el('span', '', task.name + (task.dueDate ? ' · ' + task.dueDate : '')), ctx.button('Edit task', 'pencil', () => taskDialog(ctx, task))); const project = projects.find(p => p.id === task.projectId); if (project) row.append(ctx.button(project.name, 'folder', () => ctx.open('projects', { projectId: project.id, assetId: null }))); checklist.append(row);
    }
    if (!tasks.length) checklist.append(ctx.empty('No tasks waiting.'));
    checklist.append(ctx.button('Export tasks', 'download', () => ctx.download(json({ format: 'hole-tasks', version: 1, tasks }, 'application/json'), 'Hole-tasks.json')));
    const people = ctx.section('People'); people.append(ctx.button('Add contact', 'user-plus', () => contactDialog(ctx)));
    for (const person of contacts.sort((a, b) => a.name.localeCompare(b.name))) { const row = ctx.el('div', 'hc-note he-contact'); row.append(ctx.el('strong', '', person.name), ctx.el('span', '', [person.email, person.phone].filter(Boolean).join(' · ')), ctx.button('Edit contact', 'pencil', () => contactDialog(ctx, person))); people.append(row); }
    if (!contacts.length) people.append(ctx.empty('Keep local contact details beside the work they belong to.'));
    people.append(ctx.button('Export contacts', 'download', () => ctx.download(json({ format: 'hole-contacts', version: 1, contacts }, 'application/json'), 'Hole-contacts.json')));
  }
  async function newDocument(ctx, existing = null) {
    const d = ctx.modal(existing ? 'Edit document' : 'A page for your thoughts.', 'Use headings, bold, italic, lists, and quotes. Save creates an immutable version. Export a formatted HTML document.');
    const name = ctx.input('Document name', 'text', existing?.asset.name || 'Untitled.md'), editor = ctx.input('Document text', 'textarea', existing ? await existing.blob.text() : '# A new thought\n\n'); editor.input.classList.add('he-document-input');
    const preview = ctx.el('article', 'he-document-preview'); preview.setAttribute('aria-label', 'Formatted document preview');
    const feedback = ctx.el('p', 'hc-status'); feedback.setAttribute('role', 'status');
    const toolbar = ctx.el('div', 'hc-row');
    const format = (prefix, suffix = '') => { const input = editor.input, start = input.selectionStart, end = input.selectionEnd; input.setRangeText(prefix + input.value.slice(start, end) + suffix, start, end, 'select'); input.dispatchEvent(new Event('input')); input.focus(); };
    toolbar.append(ctx.button('Heading', 'heading', () => format('## ')), ctx.button('Bold', 'bold', () => format('**', '**')), ctx.button('Italic', 'italic', () => format('*', '*')), ctx.button('List', 'list', () => format('- ')), ctx.button('Quote', 'quote', () => format('> ')));
    let current = existing, draftRecord = null, queue = Promise.resolve(), dirty = false;
    const draftId = 'paper-document:' + (existing?.asset.id || 'new');
    const draft = await ctx.C.get('settings', draftId);
    if (draft) { draftRecord = draft; editor.input.value = draft.text; name.input.value = draft.name; if (draft.assetId) current = await ctx.C.readAsset(draft.assetId, draft.baseVersionId); dirty = true; feedback.textContent = 'Recovered draft saved locally.'; }
    const draw = () => { preview.innerHTML = documentHTML(editor.input.value, name.input.value, false); };
    let draftPending = 0, draftFailed = false;
    const saveDraft = () => { dirty = true; draw(); const snapshot = { id: draftId, text: editor.input.value, name: name.input.value, assetId: current?.asset.id || null, baseVersionId: current?.version.id || null }; draftPending++; feedback.textContent = 'Saving draft…'; queue = queue.catch(() => {}).then(async () => { draftRecord = await ctx.C.put('settings', snapshot, { expectedRevision: draftRecord?.revision || 0 }); draftFailed = false; feedback.textContent = 'Draft saved locally'; }).catch(e => { draftFailed = true; feedback.textContent = e.message; throw e; }).finally(() => { draftPending--; }); queue.catch(() => {}); };
    editor.input.addEventListener('input', saveDraft); name.input.addEventListener('input', saveDraft); draw();
    d.append(name.wrap, toolbar, editor.wrap, preview, feedback, ctx.button('Save version', 'save', async () => { try { await queue; const result = await saveObject(ctx, current, safeName(name.input.value), new Blob([editor.input.value], { type: DOC_MIME }), 'document', 'document-edit'); current = await ctx.C.readAsset(result.asset.id); if (draftRecord) { await ctx.C.deleteRecord('settings', draftId, { expectedRevision: draftRecord.revision }); draftRecord = null; } dirty = false; feedback.textContent = 'Version saved locally'; } catch (e) { feedback.textContent = e.message; } }, 'hc-primary'), ctx.button('Export formatted HTML', 'download', () => ctx.download(new Blob([documentHTML(editor.input.value, name.input.value)], { type: 'text/html' }), safeName(name.input.value).replace(/\.[^.]+$/, '') + '.html')), ctx.button('Close', 'x', async () => { try { await queue; d.close(); await ctx.render(); } catch (e) { feedback.textContent = e.message + ' · Export the document before closing.'; } }));
    d.addEventListener('cancel', event => { if (dirty && (draftPending || draftFailed)) { event.preventDefault(); feedback.textContent = 'Use Close to retain the saved draft, or export this document.'; } }); protectDraft(d, { get pending() { return draftPending; }, get failed() { return draftFailed; } }); editor.input.focus(); ctx.H.icons();
  }
  function drawChart(ctx, target, sheet) {
    target.replaceChildren(); const values = evaluateSheet(sheet), data = values.map(row => ({ label: String(row[0]), value: Number(row[1]) })).filter(row => Number.isFinite(row.value));
    if (!data.length) { target.append(ctx.el('p', '', 'Put labels in column A and numeric values in column B to see a bar chart.')); return; }
    const max = Math.max(...data.map(d => Math.abs(d.value)), 1);
    for (const item of data) { const row = ctx.el('div', 'he-bar-row'), bar = ctx.el('span', 'he-bar'); bar.style.width = Math.max(.5, Math.abs(item.value) / max * 100) + '%'; bar.dataset.negative = String(item.value < 0); const track = ctx.el('span', 'he-bar-track'); track.append(bar); row.append(ctx.el('span', '', item.label), track, ctx.el('span', '', String(item.value))); target.append(row); }
  }
  async function tableEditor(ctx, existing = null) {
    let sheet = existing ? validateSheet(JSON.parse(await existing.blob.text())) : { version: 1, cells: [['Item', 'Amount', ''], ['Posters', '24', ''], ['Unit cost', '3.5', ''], ['Total', '=B2*B3', ''], ['', '', '']] };
    const d = ctx.modal(existing ? 'Edit table' : 'A calculation with context.', 'Use cell references, arithmetic, SUM, and AVERAGE. No formula scripts run. CSV exports the calculated values.');
    const name = ctx.input('Table name', 'text', existing?.asset.name || 'Project table.hole-sheet.json'), work = ctx.el('div', 'he-table-scroll'), chart = ctx.el('div', 'he-chart'); chart.setAttribute('aria-label', 'Bar chart from columns A and B');
    const feedback = ctx.el('p', 'hc-status'); feedback.setAttribute('role', 'status'); let current = existing, dirty = false;
    const draft = await draftSession(ctx.C, 'paper-table:' + (existing?.asset.id || 'new'), { sheet, name: name.input.value, assetId: existing?.asset.id || null, baseVersionId: existing?.version.id || null }, message => { feedback.textContent = message; });
    if (draft.recovered) { sheet = validateSheet(draft.value.sheet); name.input.value = draft.value.name; if (draft.value.assetId) current = await ctx.C.readAsset(draft.value.assetId, draft.value.baseVersionId); dirty = true; feedback.textContent = 'Recovered draft saved locally'; }
    const storeDraft = () => { dirty = true; draft.save({ sheet, name: name.input.value, assetId: current?.asset.id || null, baseVersionId: current?.version.id || null }); };
    function draw() {
      work.replaceChildren(); const table = ctx.el('table', 'he-table'), head = ctx.el('tr'); head.append(ctx.el('th', '', '')); for (let c = 0; c < Math.max(...sheet.cells.map(r => r.length)); c++) head.append(ctx.el('th', '', String.fromCharCode(65 + c))); table.append(head);
      const calculated = evaluateSheet(sheet);
      sheet.cells.forEach((row, r) => { const tr = ctx.el('tr'); tr.append(ctx.el('th', '', String(r + 1))); row.forEach((value, c) => { const td = ctx.el('td'), field = ctx.el('input', 'hc-input'); field.value = value; field.setAttribute('aria-label', String.fromCharCode(65 + c) + (r + 1)); field.addEventListener('input', () => { sheet.cells[r][c] = field.value; storeDraft(); }); field.addEventListener('change', () => draw()); td.append(field); if (value.startsWith('=')) td.append(ctx.el('output', '', String(calculated[r][c]))); tr.append(td); }); table.append(tr); }); work.append(table); drawChart(ctx, chart, sheet);
    }
    d.append(name.wrap, work, ctx.button('Add row', 'plus', () => { if (sheet.cells.length >= 100) throw new Error('This table supports up to 100 rows.'); sheet.cells.push(Array(Math.max(...sheet.cells.map(r => r.length))).fill('')); storeDraft(); draw(); }), ctx.button('Add column', 'columns-2', () => { if (Math.max(...sheet.cells.map(r => r.length)) >= 26) throw new Error('This table supports up to 26 columns.'); sheet.cells.forEach(row => row.push('')); storeDraft(); draw(); }), chart, feedback, ctx.button('Save table', 'save', async () => { try { await draft.flush(); validateSheet(sheet); const result = await saveObject(ctx, current, safeName(name.input.value), json(sheet, SHEET_MIME), 'table', 'table-edit'); current = await ctx.C.readAsset(result.asset.id); await draft.clear(); dirty = false; feedback.textContent = 'Table saved locally'; } catch (e) { feedback.textContent = e.message; } }, 'hc-primary'), ctx.button('Export CSV', 'download', () => ctx.download(new Blob([sheetCSV(sheet)], { type: 'text/csv;charset=utf-8' }), safeName(name.input.value).replace(/\..*$/, '') + '.csv')), ctx.button('Keep draft and close', 'x', async () => { try { await draft.flush(); d.close(); await ctx.render(); } catch (e) { feedback.textContent = e.message + ' · Export CSV before closing.'; } }), ctx.button('Discard changes', 'x', async () => { await draft.clear(); d.close(); await ctx.render(); }));
    name.input.addEventListener('input', storeDraft); d.addEventListener('cancel', e => { if (dirty && (draft.pending || draft.failed)) { e.preventDefault(); feedback.textContent = 'Wait for the draft to save, or export before closing.'; } }); protectDraft(d, draft); draw(); ctx.H.icons();
  }
  async function formEditor(ctx, existing = null) {
    let form = existing ? validateForm(JSON.parse(await existing.blob.text())) : { version: 1, fields: [{ id: uid(), label: 'Name', type: 'text', required: true }, { id: uid(), label: 'Email', type: 'email', required: false }], responses: [] }, current = existing;
    const d = ctx.modal(existing ? 'Open form' : 'A useful question.', 'Build and fill a local form. Responses stay in this browser; public collection needs a connected service.');
    const name = ctx.input('Form name', 'text', existing?.asset.name || 'My form.hole-form.json'), fields = ctx.el('div', 'he-form-fields'), fill = ctx.el('div', 'he-form-response'), feedback = ctx.el('p', 'hc-status'); feedback.setAttribute('role', 'status');
    let responseInputs = new Map(), dirty = !existing, answers = {};
    const draft = await draftSession(ctx.C, 'paper-form:' + (existing?.asset.id || 'new'), { form, name: name.input.value, answers, assetId: existing?.asset.id || null, baseVersionId: existing?.version.id || null }, message => { feedback.textContent = message; });
    if (draft.recovered) { form = validateForm(draft.value.form); name.input.value = draft.value.name; answers = draft.value.answers || {}; if (draft.value.assetId) current = await ctx.C.readAsset(draft.value.assetId, draft.value.baseVersionId); feedback.textContent = 'Recovered form draft'; }
    const storeDraft = () => { dirty = true; draft.save({ form, name: name.input.value, answers, assetId: current?.asset.id || null, baseVersionId: current?.version.id || null }); };
    function draw() {
      fields.replaceChildren(); fill.replaceChildren(); responseInputs = new Map();
      fields.append(ctx.el('h3', '', 'Questions')); fill.append(ctx.el('h3', '', 'Fill this form'));
      form.fields.forEach((f, index) => {
        const row = ctx.el('div', 'he-question'), label = ctx.input('Question ' + (index + 1), 'text', f.label), type = ctx.el('select', 'hc-input'); type.setAttribute('aria-label', 'Question type');
        for (const choice of ['text', 'email', 'number', 'date', 'checkbox']) { const o = ctx.el('option', '', choice); o.value = choice; type.append(o); } type.value = f.type;
        label.input.addEventListener('input', () => { f.label = label.input.value; storeDraft(); }); label.input.addEventListener('change', draw); type.addEventListener('change', () => { if (form.responses.length) { type.value = f.type; feedback.textContent = 'Keep question types stable after responses are saved. Create a new form for a different structure.'; return; } f.type = type.value; storeDraft(); draw(); });
        const required = ctx.el('label', 'hc-label', 'Required'), check = ctx.el('input'); check.type = 'checkbox'; check.checked = f.required; check.addEventListener('change', () => { f.required = check.checked; storeDraft(); }); required.append(check);
        row.append(label.wrap, type, required, ctx.button('Remove question', 'minus', () => { if (form.responses.length) throw new Error('Keep existing questions for saved responses. Make a new form to change its structure.'); form.fields.splice(index, 1); storeDraft(); draw(); })); fields.append(row);
        const answer = ctx.input(f.label + (f.required ? ' *' : ''), f.type); if (f.type === 'checkbox') answer.input.checked = !!answers[f.id]; else answer.input.value = answers[f.id] || ''; answer.input.addEventListener('input', () => { answers[f.id] = f.type === 'checkbox' ? answer.input.checked : answer.input.value; storeDraft(); }); responseInputs.set(f.id, answer.input); fill.append(answer.wrap);
      });
      fill.append(ctx.el('p', '', form.responses.length + ' saved response' + (form.responses.length === 1 ? '' : 's')));
    }
    async function save(nextForm = form) { await draft.flush(); validateForm(nextForm); const result = await saveObject(ctx, current, safeName(name.input.value), json(nextForm, FORM_MIME), 'form', 'form-edit'); current = await ctx.C.readAsset(result.asset.id); form = nextForm; await draft.clear(); dirty = false; feedback.textContent = 'Form saved locally'; }
    d.append(name.wrap, fields, ctx.button('Add question', 'plus', () => { if (form.fields.length >= 30) throw new Error('This form supports up to 30 questions.'); form.fields.push({ id: uid(), label: 'New question', type: 'text', required: false }); storeDraft(); draw(); }), ctx.button('Save form', 'save', () => save().catch(e => { feedback.textContent = e.message; }), 'hc-primary'), fill, ctx.button('Save response locally', 'check', async () => { try { const values = Object.fromEntries([...responseInputs].map(([id, input]) => [id, input.type === 'checkbox' ? input.checked : input.value])); const response = formResponse(form, values); await save({ ...form, responses: [...form.responses, response] }); answers = {}; feedback.textContent = 'Response saved locally'; draw(); } catch (e) { feedback.textContent = e.message; } }), feedback, ctx.button('Export form and responses', 'download', () => ctx.download(json(form, 'application/json'), safeName(name.input.value))), ctx.button('Keep draft and close', 'x', async () => { try { await draft.flush(); d.close(); await ctx.render(); } catch (e) { feedback.textContent = e.message; } }), ctx.button('Discard changes', 'x', async () => { await draft.clear(); d.close(); await ctx.render(); }));
    name.input.addEventListener('input', storeDraft); d.addEventListener('cancel', e => { if (dirty && (draft.pending || draft.failed)) { e.preventDefault(); feedback.textContent = 'Wait for the draft to save, or export before closing.'; } }); protectDraft(d, draft); draw(); ctx.H.icons();
  }
  async function paperwork(ctx) {
    const tools = ctx.el('div', 'hc-row'); tools.append(ctx.button('Formatted document', 'file-text', () => newDocument(ctx)), ctx.button('Table & chart', 'table-2', () => tableEditor(ctx)), ctx.button('Local form', 'list-checks', () => formEditor(ctx))); ctx.main.append(tools);
    const assets = (await ctx.C.list('assets')).filter(a => a.state === 'active').sort((a, b) => b.updatedAt - a.updatedAt), grid = ctx.el('div', 'hc-grid'); ctx.main.append(grid);
    for (const asset of assets) {
      const wrap = ctx.el('div', 'he-paper-item'); wrap.append(await ctx.card(asset));
      if (asset.mime === SHEET_MIME) wrap.append(ctx.button('Edit table', 'table-2', async () => tableEditor(ctx, await ctx.C.readAsset(asset.id))));
      else if (asset.mime === FORM_MIME) wrap.append(ctx.button('Open form', 'list-checks', async () => formEditor(ctx, await ctx.C.readAsset(asset.id))));
      else if (asset.mime === DOC_MIME) wrap.append(ctx.button('Edit document', 'file-text', async () => newDocument(ctx, await ctx.C.readAsset(asset.id))));
      else if (asset.mime === 'application/pdf') wrap.append(ctx.button('PDF tools', 'file-pen', async () => { if (window.HolePDF) await window.HolePDF.edit(ctx, await ctx.C.readAsset(asset.id)); else { const d = ctx.modal('PDF tools', 'PDF viewing and download are available. Annotation, drawn signatures, and actual content redaction require an integrated PDF engine; visual blackouts are not redaction.'); d.append(ctx.button('Open PDF', 'file', () => { d.close(); ctx.navigate({ view: 'projects', assetId: asset.id }); }), ctx.button('Close', 'x', () => d.close())); } }));
      grid.append(wrap);
    }
    if (!assets.length) grid.append(ctx.empty('Capture an idea, import a file, or start a document.'));
  }
  window.HoleEveryday = Object.freeze({ day, paperwork, newDocument, tableEditor, formEditor, model });
})();
