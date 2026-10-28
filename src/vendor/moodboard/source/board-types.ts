/** Core data model for a Moodboard. Kept dependency-free so it's trivially
 * unit-testable (layout math, serialization) without touching the DOM.
 */

export type ItemKind = "image" | "note" | "swatch" | "frame";

interface BaseItem {
  id: string;
  kind: ItemKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Paint/stack order; higher draws on top. */
  z: number;
  tags: string[];
  /** Id of the frame this item is grouped into, if any. */
  groupId: string | null;
}

export interface ImageItem extends BaseItem {
  kind: "image";
  name: string;
  /** Always a data: URL so the board (and the .moodboard file) is self-contained. */
  src: string;
}

export interface NoteItem extends BaseItem {
  kind: "note";
  text: string;
  color: string;
}

export interface SwatchItem extends BaseItem {
  kind: "swatch";
  color: string;
  /** Name of the image this swatch was extracted from, if any (for provenance, not required). */
  sourceName?: string;
}

export interface FrameItem extends BaseItem {
  kind: "frame";
  name: string;
}

export type BoardItem = ImageItem | NoteItem | SwatchItem | FrameItem;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MOODBOARD_FORMAT_VERSION = 1;

export interface Board {
  version: typeof MOODBOARD_FORMAT_VERSION;
  id: string;
  name: string;
  items: BoardItem[];
  camera: Camera;
  createdAt: number;
  updatedAt: number;
}

let counter = 0;
/** Collision-safe-enough id for a single browser session (not crypto). */
export function makeId(prefix = "item"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function emptyBoard(name = "Untitled board"): Board {
  const now = Date.now();
  return {
    version: MOODBOARD_FORMAT_VERSION,
    id: makeId("board"),
    name,
    items: [],
    camera: { x: 0, y: 0, zoom: 1 },
    createdAt: now,
    updatedAt: now,
  };
}

export function nextZ(items: BoardItem[]): number {
  return items.reduce((max, it) => Math.max(max, it.z), 0) + 1;
}
