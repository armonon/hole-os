/**
 * Core data model for a Portfolio project. Everything the app needs to
 * render a site, export it, or save/load a `.portfolio` file lives in one
 * `PortfolioDoc`. Media is stored as data URLs so the whole document is a
 * single, portable, losslessly round-trippable JSON blob (see
 * src/lib/portfolio-file.ts) — the same data also drives the static-site
 * export (src/lib/export-zip.ts) and the live preview.
 */

export type AssetKind = "image" | "video" | "model";

export interface MediaAsset {
  id: string;
  kind: AssetKind;
  /** Original filename, used for the exported assets/ folder and alt text. */
  name: string;
  /** MIME type, e.g. "image/jpeg", "video/mp4", "model/gltf-binary". */
  mimeType: string;
  /** data: URL — the canonical, portable storage form of the file. */
  dataUrl: string;
}

export interface ProjectEntry {
  id: string;
  title: string;
  description: string;
  assets: MediaAsset[];
  /** Asset id used as the cover/thumbnail; null falls back to the first asset. */
  coverAssetId: string | null;
}

export interface LinkEntry {
  id: string;
  label: string;
  url: string;
}

export type TemplateId = "grid" | "editorial" | "sidebar";

export const TEMPLATE_IDS: TemplateId[] = ["grid", "editorial", "sidebar"];

export const TEMPLATE_LABELS: Record<TemplateId, string> = {
  grid: "Minimal Grid",
  editorial: "Editorial Stack",
  sidebar: "Sidebar Bio",
};

export interface PortfolioDoc {
  /** Bumped only if the on-disk .portfolio shape ever changes incompatibly. */
  version: 1;
  artistName: string;
  bio: string;
  templateId: TemplateId;
  links: LinkEntry[];
  projects: ProjectEntry[];
}

export function emptyDoc(): PortfolioDoc {
  return {
    version: 1,
    artistName: "",
    bio: "",
    templateId: "grid",
    links: [],
    projects: [],
  };
}

export function coverAsset(project: ProjectEntry): MediaAsset | null {
  if (project.assets.length === 0) return null;
  if (project.coverAssetId) {
    const found = project.assets.find((a) => a.id === project.coverAssetId);
    if (found) return found;
  }
  return project.assets[0];
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newProject(): ProjectEntry {
  return { id: randomId(), title: "Untitled project", description: "", assets: [], coverAssetId: null };
}

export function newLink(): LinkEntry {
  return { id: randomId(), label: "", url: "" };
}

export function newAssetId(): string {
  return randomId();
}
