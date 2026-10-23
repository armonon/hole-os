/* A workspace launch surface for the existing Hole search experience. */
(() => {
  'use strict';
  const HOME_URL = 'https://thecreatingco.com/community/hole';
  const api = window.HoleOS;
  if (!api) return;
  let mount = null;

  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function icon(name) {
    const item = node('i'); item.dataset.lucide = name; item.setAttribute('aria-hidden', 'true'); return item;
  }
  function mountBrowser(rec) {
    const body = rec?.el?.querySelector('.hf-window-body');
    if (!body || mount?.body === body) return;
    body.replaceChildren(); body.classList.add('hb-body');
    const app = node('div', 'hb-app'), brand = node('div', 'hb-brand'), mark = node('span', 'hb-mark'), brandText = node('div');
    mark.append(icon('orbit')); brandText.append(node('strong', '', 'Hole Browser'), node('small', '', 'A window to the web')); brand.append(mark, brandText);
    const art = node('div', 'hb-orbit'); art.setAttribute('aria-hidden', 'true'); art.append(node('span', 'hb-orbit-core'), node('span', 'hb-orbit-moon'));
    const heading = node('h2', '', 'Follow your curiosity.');
    const intro = node('p', 'hb-copy', 'Search the web, follow an idea, and find your next direction.');
    const link = node('a', 'hb-launch cursor-interaction'); link.href = HOME_URL; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.append(icon('search'), node('span', '', 'Search with Hole'), icon('arrow-up-right'));
    const note = node('p', 'hb-note', 'Opens Hole in a new tab. Your workspace stays here.');
    app.append(brand, art, heading, intro, link, note); body.append(app);
    mount = { body, link }; api.icons?.();
  }
  function open({ launchExternal = false, origin } = {}) {
    api.openApp('Browser', origin);
    mountBrowser(api.windows.get('Browser'));
    if (launchExternal) mount?.link.click();
  }
  api.root.addEventListener('hole:window-change', event => {
    const { rec, type } = event.detail || {};
    if (rec?.app?.name !== 'Browser') return;
    if (type === 'close' || type === 'closed') { if (mount?.body === rec.el.querySelector('.hf-window-body')) mount = null; }
    else mountBrowser(rec);
  });
  window.HoleBrowser = { open, url: HOME_URL };
  api.windows.forEach(rec => { if (rec.app?.name === 'Browser') mountBrowser(rec); });
})();
