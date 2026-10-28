/**
 * Pure, dependency-free template rendering: given a PortfolioDoc, produces
 * the HTML structure for the chosen template. Used for the live in-app
 * preview (rendered directly into the DOM) AND for the static-site export
 * (src/lib/export-zip.ts writes the same markup into index.html) — one
 * rendering path, so what you preview is exactly what you export.
 */
import { coverAsset, type MediaAsset, type PortfolioDoc, type ProjectEntry, type TemplateId } from "./types";

export type AssetSrcFn = (asset: MediaAsset, project: ProjectEntry) => string;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphs(text: string, className: string): string {
  if (!text.trim()) return "";
  return text
    .split(/\n{2,}/)
    .map((p) => `<p class="${className}">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function renderMedia(asset: MediaAsset, project: ProjectEntry, assetSrc: AssetSrcFn): string {
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

function renderLinks(doc: PortfolioDoc): string {
  if (!doc.links.length) return "";
  const items = doc.links
    .filter((l) => l.url.trim())
    .map((l) => `<li><a href="${escapeHtml(l.url)}" target="_blank" rel="noreferrer">${escapeHtml(l.label.trim() || l.url)}</a></li>`)
    .join("");
  return items ? `<ul class="links">${items}</ul>` : "";
}

function projectId(project: ProjectEntry): string {
  return `project-${project.id}`;
}

function renderCoverThumb(project: ProjectEntry, assetSrc: AssetSrcFn): string {
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

function renderProjectSection(project: ProjectEntry, assetSrc: AssetSrcFn): string {
  const media = project.assets.map((a) => renderMedia(a, project, assetSrc)).join("");
  return `<section class="project" id="${projectId(project)}" data-project-id="${escapeHtml(project.id)}">
    <h2 class="project-title">${escapeHtml(project.title)}</h2>
    ${paragraphs(project.description, "project-description")}
    <div class="project-media">${media}</div>
  </section>`;
}

function headerBlock(doc: PortfolioDoc, withSuiteMenu: boolean): string {
  return `<header class="site-header">
    <h1 class="artist-name">${escapeHtml(doc.artistName || "Untitled portfolio")}</h1>
    ${withSuiteMenu ? `<tcc-suite-menu></tcc-suite-menu>` : ""}
  </header>`;
}

function footerBlock(doc: PortfolioDoc): string {
  return `<footer class="site-footer">${renderBio(doc)}${renderLinks(doc)}</footer>`;
}

function renderBio(doc: PortfolioDoc): string {
  return paragraphs(doc.bio, "bio");
}

function buildGridBody(doc: PortfolioDoc, assetSrc: AssetSrcFn, withSuiteMenu: boolean): string {
  const grid = doc.projects
    .map(
      (p) => `<a class="grid-item" href="#${projectId(p)}">
        ${renderCoverThumb(p, assetSrc)}
        <span class="grid-item-title">${escapeHtml(p.title)}</span>
      </a>`,
    )
    .join("");
  const sections = doc.projects.map((p) => renderProjectSection(p, assetSrc)).join("");
  return `${headerBlock(doc, withSuiteMenu)}
  <main>
    <nav class="grid" aria-label="Projects">${grid}</nav>
    <div class="project-list">${sections}</div>
  </main>
  ${footerBlock(doc)}`;
}

function buildEditorialBody(doc: PortfolioDoc, assetSrc: AssetSrcFn, withSuiteMenu: boolean): string {
  const stack = doc.projects
    .map((p) => {
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
    })
    .join("");
  return `${headerBlock(doc, withSuiteMenu)}
  <main>
    <div class="editorial-stack">${stack}</div>
  </main>
  ${footerBlock(doc)}`;
}

function buildSidebarBody(doc: PortfolioDoc, assetSrc: AssetSrcFn, withSuiteMenu: boolean): string {
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

const BODY_BUILDERS: Record<TemplateId, (doc: PortfolioDoc, assetSrc: AssetSrcFn, withSuiteMenu: boolean) => string> = {
  grid: buildGridBody,
  editorial: buildEditorialBody,
  sidebar: buildSidebarBody,
};

/** Inner content for `<div class="site template-<id>">` — used for both live preview and export. */
export function buildSiteBodyHtml(doc: PortfolioDoc, assetSrc: AssetSrcFn, withSuiteMenu = false): string {
  return BODY_BUILDERS[doc.templateId](doc, assetSrc, withSuiteMenu);
}

export function hasModelAsset(doc: PortfolioDoc): boolean {
  return doc.projects.some((p) => p.assets.some((a) => a.kind === "model"));
}

const BASE_CSS = `
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

const GRID_CSS = `
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1.25rem; padding: 0 2rem 2rem; }
.grid-item { display: block; text-decoration: none; color: inherit; }
.thumb { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 4px; background: #e7e3d8; }
.thumb-empty { background: repeating-linear-gradient(45deg, #e7e3d8, #e7e3d8 8px, #ded9cb 8px, #ded9cb 16px); }
.grid-item-title { display: block; margin-top: 0.4rem; font-size: 0.95rem; }
.project-list { padding: 0 2rem; display: grid; gap: 3rem; }
`;

const EDITORIAL_CSS = `
.editorial-stack { display: grid; gap: 4rem; padding: 0 0 2rem; }
.editorial-entry { display: grid; gap: 1rem; padding: 0 2rem; }
.editorial-hero .asset { width: 100%; max-height: 80vh; object-fit: cover; }
.editorial-copy { max-width: 70ch; }
.editorial-extra { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
`;

const SIDEBAR_CSS = `
.sidebar-layout { display: grid; grid-template-columns: 280px 1fr; align-items: start; }
.sidebar { position: sticky; top: 0; padding: 1.5rem; border-right: 1px solid rgba(23,22,15,0.12); min-height: 100vh; }
.sidebar .site-header { padding: 0 0 1rem; }
.sidebar-nav { list-style: none; padding: 0; margin: 1rem 0 0; display: grid; gap: 0.4rem; }
.sidebar-nav a { color: inherit; text-decoration: none; border-bottom: 1px dotted transparent; }
.sidebar-nav a:hover { border-bottom-color: currentColor; }
.sidebar-main .project-list { padding: 2rem; display: grid; gap: 3rem; }
@media (max-width: 720px) { .sidebar-layout { grid-template-columns: 1fr; } .sidebar { position: static; min-height: auto; } }
`;

const TEMPLATE_CSS: Record<TemplateId, string> = { grid: GRID_CSS, editorial: EDITORIAL_CSS, sidebar: SIDEBAR_CSS };

export function buildSiteCss(templateId: TemplateId): string {
  return `${BASE_CSS}\n${TEMPLATE_CSS[templateId]}`;
}

export interface BuildDocumentOptions {
  assetSrc: AssetSrcFn;
  /** <script type="module" src="..."> for the model-viewer runtime; omitted entirely if there's no model asset. */
  modelViewerScriptSrc?: string;
  withSuiteMenu?: boolean;
}

/** Full, self-contained HTML document — used for the static-site export. */
export function buildSiteDocument(doc: PortfolioDoc, options: BuildDocumentOptions): string {
  const body = buildSiteBodyHtml(doc, options.assetSrc, options.withSuiteMenu ?? false);
  const title = escapeHtml(doc.artistName ? `${doc.artistName} — Portfolio` : "Portfolio");
  const modelScript =
    options.modelViewerScriptSrc && hasModelAsset(doc)
      ? `<script type="module" src="${options.modelViewerScriptSrc}"></script>`
      : "";
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
