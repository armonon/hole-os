/* Local browser Trails record deliberate outbound visits, never external tab activity. */
(() => {
  'use strict';
  const HOME_URL = 'https://thecreatingco.com/community/hole';
  function destination(query) {
    const text = String(query || '').trim();
    if (!text) return HOME_URL;
    if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
      const url = new URL(text);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Open an HTTP or HTTPS address without embedded credentials.');
      return url.href;
    }
    return 'https://duckduckgo.com/?q=' + encodeURIComponent(text);
  }
  function createHistory(core) {
    async function list({ projectId = undefined, savedOnly = false } = {}) {
      return (await core.list('links')).filter(record => record.kind === 'browser-visit' && (projectId === undefined || record.projectId === projectId) && (!savedOnly || record.saved)).sort((a, b) => b.visitedAt - a.visitedAt);
    }
    async function visit(query, projectId = null) {
      return core.put('links', { id: `browser:${crypto.randomUUID()}`, kind: 'browser-visit', query: String(query || '').trim(), url: destination(query), projectId, visitedAt: Date.now(), saved: false });
    }
    async function save(record, saved = true, title = record.title || record.query || record.url) {
      return core.put('links', { ...record, saved, title: String(title).slice(0, 240) }, { expectedRevision: record.revision });
    }
    async function forget(record) { return core.deleteRecord('links', record.id, { expectedRevision: record.revision }); }
    return Object.freeze({ list, visit, save, forget });
  }
  globalThis.HoleBrowserModel = Object.freeze({ destination, createHistory });
  if (typeof window === 'undefined' || !window.HoleOS) return;
  const api = window.HoleOS;
  let mount = null, context = { query: '', projectId: null };
  function node(tag, className = '', text = '') { const item = document.createElement(tag); item.className = className; item.textContent = text; return item; }
  function mountBrowser(rec) {
    const body = rec?.el?.querySelector('.hf-window-body');
    if (!body) return;
    if (mount?.body === body) { mount.query.value = context.query; void mount.draw(); return; }
    body.replaceChildren(); body.classList.add('hb-body');
    const app = node('div', 'hb-app'), heading = node('h2', '', 'Hole Browser'), description = node('p', 'hb-copy', 'Search the web or open an address. Searches use DuckDuckGo in a new tab. Trails remember only visits you start here.'), form = node('form'), query = node('input', 'hc-input'), go = node('button', 'hb-launch', 'Open web search or address'), feedback = node('p', 'hb-note'), entries = node('section'), scope = node('select', 'hc-input');
    query.type = 'search'; query.value = context.query; query.setAttribute('aria-label', 'Web search or address'); query.style.width = '100%'; query.style.boxSizing = 'border-box'; go.type = 'submit'; feedback.setAttribute('role', 'status');
    scope.setAttribute('aria-label', 'Trail filter'); scope.append(new Option('All local history', 'all'), new Option('Saved Trails', 'saved'), new Option('Current project', 'project'));
    const home = node('a', 'hb-note', 'Open Hole community'); home.href = HOME_URL; home.target = '_blank'; home.rel = 'noopener noreferrer';
    form.append(query, go); app.append(heading, description, form, feedback, home, node('h3', '', 'Trails & history'), scope, entries); body.append(app);
    const history = window.HoleCore && createHistory(window.HoleCore);
    const report = error => { feedback.textContent = error.message || String(error); };
    async function draw() {
      if (!history) { feedback.textContent = 'Local storage is unavailable. History cannot be saved.'; return; }
      try {
        const records = await history.list({ ...(scope.value === 'project' ? { projectId: context.projectId } : {}), savedOnly: scope.value === 'saved' });
        entries.replaceChildren();
        for (const record of records) {
          const row = node('article', 'hc-note'), link = node('a', '', record.title || record.query || record.url), save = node('button', '', record.saved ? 'Unsave Trail' : 'Save Trail'), forget = node('button', '', 'Forget visit');
          link.href = destination(record.url); link.target = '_blank'; link.rel = 'noopener noreferrer'; link.style.overflowWrap = 'anywhere';
          link.addEventListener('click', () => { void history.visit(record.url, record.projectId).then(draw).catch(report); });
          save.addEventListener('click', async () => { try { await history.save(record, !record.saved); await draw(); } catch (error) { report(error); } });
          forget.addEventListener('click', async () => { try { await history.forget(record); await draw(); } catch (error) { report(error); } });
          row.append(link, node('p', 'hb-note', `${new Date(record.visitedAt).toLocaleString()}${record.projectId ? ' · Project: ' + record.projectId : ''}`), save, forget); entries.append(row);
        }
        if (!records.length) entries.append(node('p', 'hb-note', 'No visits in this view.'));
      } catch (error) { report(error); }
    }
    function launch() {
      let url; try { url = destination(query.value); } catch (error) { report(error); return; }
      const link = node('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click();
      feedback.textContent = 'Requested a new tab. External page activity is not tracked.';
      if (history) void history.visit(query.value, context.projectId).then(draw).catch(error => { report(new Error('Visit opened, but local history was not saved: ' + error.message)); });
    }
    form.addEventListener('submit', event => { event.preventDefault(); launch(); }); scope.addEventListener('change', () => void draw());
    const exportButton = node('button', '', 'Export local Trails and history'); exportButton.addEventListener('click', async () => {
      try { const records = await history.list(), blob = new Blob([JSON.stringify({ format: 'hole-browser-trails', version: 1, records }, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), link = node('a'); link.href = url; link.download = 'Hole-Browser-Trails.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (error) { report(error); }
    }); app.append(exportButton);
    mount = { body, query, draw, launch }; void draw(); api.icons?.();
  }
  function open({ launchExternal = false, origin, query = '', projectId = null } = {}) {
    context = { query: String(query), projectId }; api.openApp('Browser', origin); mountBrowser(api.windows.get('Browser'));
    if (launchExternal) mount?.launch(); else mount?.query.focus();
  }
  api.root.addEventListener('hole:window-change', event => {
    const { rec, type } = event.detail || {}; if (rec?.app?.name !== 'Browser') return;
    if (type === 'close' || type === 'closed') { if (mount?.body === rec.el.querySelector('.hf-window-body')) mount = null; }
    else if (mount?.body !== rec.el.querySelector('.hf-window-body')) mountBrowser(rec);
  });
  window.HoleBrowser = Object.freeze({ open, url: HOME_URL, model: globalThis.HoleBrowserModel });
  api.windows.forEach(rec => { if (rec.app?.name === 'Browser') mountBrowser(rec); });
})();
