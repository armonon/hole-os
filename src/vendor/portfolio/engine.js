/* Retained owned Portfolio engine ae9a10e30204bcb9771272a48dc34a887b478693. No open-source license asserted. */
var PortfolioEngine = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <stdin>
  var stdin_exports = {};
  __export(stdin_exports, {
    TEMPLATE_IDS: () => TEMPLATE_IDS,
    TEMPLATE_LABELS: () => TEMPLATE_LABELS,
    buildSiteBodyHtml: () => buildSiteBodyHtml,
    buildSiteCss: () => buildSiteCss,
    buildSiteDocument: () => buildSiteDocument,
    coverAsset: () => coverAsset,
    dataUrlToBytes: () => dataUrlToBytes,
    emptyDoc: () => emptyDoc,
    escapeHtml: () => escapeHtml,
    extensionForMime: () => extensionForMime,
    fileToDataUrl: () => fileToDataUrl,
    hasModelAsset: () => hasModelAsset,
    kindForMime: () => kindForMime,
    newAssetId: () => newAssetId,
    newLink: () => newLink,
    newProject: () => newProject
  });

  // ../tcc-operations/repos/portfolio-studio/src/lib/types.ts
  var TEMPLATE_IDS = ["grid", "editorial", "sidebar"];
  var TEMPLATE_LABELS = {
    grid: "Minimal Grid",
    editorial: "Editorial Stack",
    sidebar: "Sidebar Bio"
  };
  function emptyDoc() {
    return {
      version: 1,
      artistName: "",
      bio: "",
      templateId: "grid",
      links: [],
      projects: []
    };
  }
  function coverAsset(project) {
    if (project.assets.length === 0) return null;
    if (project.coverAssetId) {
      const found = project.assets.find((a) => a.id === project.coverAssetId);
      if (found) return found;
    }
    return project.assets[0];
  }
  function randomId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  function newProject() {
    return { id: randomId(), title: "Untitled project", description: "", assets: [], coverAssetId: null };
  }
  function newLink() {
    return { id: randomId(), label: "", url: "" };
  }
  function newAssetId() {
    return randomId();
  }

  // ../tcc-operations/repos/portfolio-studio/src/lib/site-builder.ts
  function escapeHtml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function paragraphs(text, className) {
    if (!text.trim()) return "";
    return text.split(/\n{2,}/).map((p) => `<p class="${className}">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`).join("");
  }
  function renderMedia(asset, project, assetSrc) {
    const src = assetSrc(asset, project);
    const alt = escapeHtml(asset.name || project.title);
    if (asset.kind === "image") {
      return `<img class="asset asset-image" src="${src}" alt="${alt}" loading="lazy" />`;
    }
    if (asset.kind === "video") {
      return `<video class="asset asset-video" src="${src}" controls playsinline preload="metadata"></video>`;
    }
    return `<model-viewer class="asset asset-model" src="${src}" alt="${alt}" camera-controls auto-rotate shadow-intensity="1"></model-viewer>`;
  }
  function renderLinks(doc) {
    if (!doc.links.length) return "";
    const items = doc.links.filter((l) => l.url.trim()).map((l) => `<li><a href="${escapeHtml(l.url)}" target="_blank" rel="noreferrer">${escapeHtml(l.label.trim() || l.url)}</a></li>`).join("");
    return items ? `<ul class="links">${items}</ul>` : "";
  }
  function projectId(project) {
    return `project-${project.id}`;
  }
  function renderCoverThumb(project, assetSrc) {
    const cover = coverAsset(project);
    if (!cover) return `<div class="thumb thumb-empty" aria-hidden="true"></div>`;
    if (cover.kind === "video") {
      return `<video class="thumb" src="${assetSrc(cover, project)}" muted playsinline preload="metadata"></video>`;
    }
    if (cover.kind === "model") {
      return `<model-viewer class="thumb" src="${assetSrc(cover, project)}" camera-controls disable-zoom></model-viewer>`;
    }
    return `<img class="thumb" src="${assetSrc(cover, project)}" alt="${escapeHtml(project.title)}" loading="lazy" />`;
  }
  function renderProjectSection(project, assetSrc) {
    const media = project.assets.map((a) => renderMedia(a, project, assetSrc)).join("");
    return `<section class="project" id="${projectId(project)}" data-project-id="${escapeHtml(project.id)}">
    <h2 class="project-title">${escapeHtml(project.title)}</h2>
    ${paragraphs(project.description, "project-description")}
    <div class="project-media">${media}</div>
  </section>`;
  }
  function headerBlock(doc, withSuiteMenu) {
    return `<header class="site-header">
    <h1 class="artist-name">${escapeHtml(doc.artistName || "Untitled portfolio")}</h1>
    ${withSuiteMenu ? `<tcc-suite-menu></tcc-suite-menu>` : ""}
  </header>`;
  }
  function footerBlock(doc) {
    return `<footer class="site-footer">${renderBio(doc)}${renderLinks(doc)}</footer>`;
  }
  function renderBio(doc) {
    return paragraphs(doc.bio, "bio");
  }
  function buildGridBody(doc, assetSrc, withSuiteMenu) {
    const grid = doc.projects.map(
      (p) => `<a class="grid-item" href="#${projectId(p)}">
        ${renderCoverThumb(p, assetSrc)}
        <span class="grid-item-title">${escapeHtml(p.title)}</span>
      </a>`
    ).join("");
    const sections = doc.projects.map((p) => renderProjectSection(p, assetSrc)).join("");
    return `${headerBlock(doc, withSuiteMenu)}
  <main>
    <nav class="grid" aria-label="Projects">${grid}</nav>
    <div class="project-list">${sections}</div>
  </main>
  ${footerBlock(doc)}`;
  }
  function buildEditorialBody(doc, assetSrc, withSuiteMenu) {
    const stack = doc.projects.map((p) => {
      const cover = coverAsset(p);
      const rest = p.assets.filter((a) => a.id !== cover?.id);
      return `<article class="editorial-entry" id="${projectId(p)}" data-project-id="${escapeHtml(p.id)}">
        ${cover ? `<div class="editorial-hero">${renderMedia(cover, p, assetSrc)}</div>` : ""}
        <div class="editorial-copy">
          <h2 class="project-title">${escapeHtml(p.title)}</h2>
          ${paragraphs(p.description, "project-description")}
        </div>
        ${rest.length ? `<div class="editorial-extra project-media">${rest.map((a) => renderMedia(a, p, assetSrc)).join("")}</div>` : ""}
      </article>`;
    }).join("");
    return `${headerBlock(doc, withSuiteMenu)}
  <main>
    <div class="editorial-stack">${stack}</div>
  </main>
  ${footerBlock(doc)}`;
  }
  function buildSidebarBody(doc, assetSrc, withSuiteMenu) {
    const navItems = doc.projects.map((p) => `<li><a href="#${projectId(p)}">${escapeHtml(p.title)}</a></li>`).join("");
    const sections = doc.projects.map((p) => renderProjectSection(p, assetSrc)).join("");
    return `<div class="sidebar-layout">
    <aside class="sidebar">
      ${headerBlock(doc, withSuiteMenu)}
      ${renderBio(doc)}
      ${renderLinks(doc)}
      <nav aria-label="Projects"><ul class="sidebar-nav">${navItems}</ul></nav>
    </aside>
    <main class="sidebar-main">
      <div class="project-list">${sections}</div>
    </main>
  </div>`;
  }
  var BODY_BUILDERS = {
    grid: buildGridBody,
    editorial: buildEditorialBody,
    sidebar: buildSidebarBody
  };
  function buildSiteBodyHtml(doc, assetSrc, withSuiteMenu = false) {
    return BODY_BUILDERS[doc.templateId](doc, assetSrc, withSuiteMenu);
  }
  function hasModelAsset(doc) {
    return doc.projects.some((p) => p.assets.some((a) => a.kind === "model"));
  }
  var BASE_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, "Inter", "Helvetica Neue", Arial, sans-serif; color: #17160f; background: #f6f3ec; }
img, video, model-viewer { max-width: 100%; display: block; }
model-viewer { width: 100%; height: 420px; background: #f1efe8; border-radius: 4px; }
.site-header { display: flex; align-items: center; justify-content: space-between; padding: 1.5rem 2rem; }
.artist-name { font-size: 1.1rem; font-weight: 600; margin: 0; letter-spacing: 0.01em; }
tcc-suite-menu { display: inline-block; width: 36px; height: 36px; flex: none; }
.bio { max-width: 60ch; line-height: 1.6; }
.links { list-style: none; display: flex; flex-wrap: wrap; gap: 1rem; padding: 0; margin: 0.75rem 0 0; }
.links a { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
.site-footer { padding: 2rem; border-top: 1px solid rgba(23,22,15,0.12); margin-top: 3rem; }
.project-title { font-size: 1.4rem; margin: 0 0 0.5rem; }
.project-description { line-height: 1.6; max-width: 65ch; }
.project-media { display: grid; gap: 0.75rem; }
.project-media .asset { border-radius: 4px; }
`;
  var GRID_CSS = `
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1.25rem; padding: 0 2rem 2rem; }
.grid-item { display: block; text-decoration: none; color: inherit; }
.thumb { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 4px; background: #e7e3d8; }
.thumb-empty { background: repeating-linear-gradient(45deg, #e7e3d8, #e7e3d8 8px, #ded9cb 8px, #ded9cb 16px); }
.grid-item-title { display: block; margin-top: 0.4rem; font-size: 0.95rem; }
.project-list { padding: 0 2rem; display: grid; gap: 3rem; }
`;
  var EDITORIAL_CSS = `
.editorial-stack { display: grid; gap: 4rem; padding: 0 0 2rem; }
.editorial-entry { display: grid; gap: 1rem; padding: 0 2rem; }
.editorial-hero .asset { width: 100%; max-height: 80vh; object-fit: cover; }
.editorial-copy { max-width: 70ch; }
.editorial-extra { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
`;
  var SIDEBAR_CSS = `
.sidebar-layout { display: grid; grid-template-columns: 280px 1fr; align-items: start; }
.sidebar { position: sticky; top: 0; padding: 1.5rem; border-right: 1px solid rgba(23,22,15,0.12); min-height: 100vh; }
.sidebar .site-header { padding: 0 0 1rem; }
.sidebar-nav { list-style: none; padding: 0; margin: 1rem 0 0; display: grid; gap: 0.4rem; }
.sidebar-nav a { color: inherit; text-decoration: none; border-bottom: 1px dotted transparent; }
.sidebar-nav a:hover { border-bottom-color: currentColor; }
.sidebar-main .project-list { padding: 2rem; display: grid; gap: 3rem; }
@media (max-width: 720px) { .sidebar-layout { grid-template-columns: 1fr; } .sidebar { position: static; min-height: auto; } }
`;
  var TEMPLATE_CSS = { grid: GRID_CSS, editorial: EDITORIAL_CSS, sidebar: SIDEBAR_CSS };
  function buildSiteCss(templateId) {
    return `${BASE_CSS}
${TEMPLATE_CSS[templateId]}`;
  }
  function buildSiteDocument(doc, options) {
    const body = buildSiteBodyHtml(doc, options.assetSrc, options.withSuiteMenu ?? false);
    const title = escapeHtml(doc.artistName ? `${doc.artistName} \u2014 Portfolio` : "Portfolio");
    const modelScript = options.modelViewerScriptSrc && hasModelAsset(doc) ? `<script type="module" src="${options.modelViewerScriptSrc}"><\/script>` : "";
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style>${buildSiteCss(doc.templateId)}</style>
${modelScript}
</head>
<body>
<div class="site template-${doc.templateId}">${body}</div>
</body>
</html>`;
  }

  // ../tcc-operations/repos/portfolio-studio/src/lib/data-url.ts
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
      reader.readAsDataURL(file);
    });
  }
  function dataUrlToBytes(dataUrl) {
    const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
    if (!match) throw new Error("Not a valid data URL");
    const [, mime = "application/octet-stream", isBase64, payload] = match;
    if (isBase64) {
      const binary = atob(payload);
      const bytes2 = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes2[i] = binary.charCodeAt(i);
      return { bytes: bytes2, mime };
    }
    const bytes = new TextEncoder().encode(decodeURIComponent(payload));
    return { bytes, mime };
  }
  var EXTENSION_BY_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "model/gltf-binary": ".glb",
    "model/gltf+json": ".gltf"
  };
  function extensionForMime(mime, fallbackName = "") {
    if (EXTENSION_BY_MIME[mime]) return EXTENSION_BY_MIME[mime];
    const match = /\.[a-zA-Z0-9]+$/.exec(fallbackName);
    if (match) return match[0].toLowerCase();
    return "";
  }
  function kindForMime(mime, fallbackName = "") {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("model/") || /\.glb$/i.test(fallbackName) || /\.gltf$/i.test(fallbackName)) return "model";
    return "image";
  }
  return __toCommonJS(stdin_exports);
})();
