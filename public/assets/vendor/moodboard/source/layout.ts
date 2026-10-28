/** Layout engine: auto-grid placement and snap math. Pure functions, no DOM —
 * unit-tested directly in tests/layout.test.ts.
 */
import type { BoardItem } from "./board-types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridLayoutOptions {
  /** Top-left of the grid in board space. */
  originX?: number;
  originY?: number;
  /** Gap between cells, in board units. */
  gap?: number;
  /** Number of columns; if omitted, computed to be roughly square. */
  columns?: number;
}

/**
 * Places `items` into a left-to-right, top-to-bottom grid. Each row's height
 * is the tallest item in that row, so items keep their own aspect ratio
 * (no stretching) while still forming a tidy grid. Returns a new array of
 * `{ id, x, y }` placements — callers apply them to their own item copies.
 */
export function autoGridLayout(
  items: Pick<BoardItem, "id" | "w" | "h">[],
  options: GridLayoutOptions = {},
): Array<{ id: string; x: number; y: number }> {
  const gap = options.gap ?? 24;
  const originX = options.originX ?? 0;
  const originY = options.originY ?? 0;
  const columns = options.columns ?? Math.max(1, Math.round(Math.sqrt(items.length)));

  const placements: Array<{ id: string; x: number; y: number }> = [];
  let cursorY = originY;
  for (let row = 0; row * columns < items.length; row++) {
    const rowItems = items.slice(row * columns, row * columns + columns);
    const rowHeight = Math.max(...rowItems.map((it) => it.h));
    let cursorX = originX;
    for (const it of rowItems) {
      placements.push({ id: it.id, x: cursorX, y: cursorY });
      cursorX += it.w + gap;
    }
    cursorY += rowHeight + gap;
  }
  return placements;
}

/** Rounds a single coordinate to the nearest multiple of `gridSize`. */
export function snapValueToGrid(value: number, gridSize: number): number {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

/** Snaps a rect's top-left to the grid. */
export function snapRectToGrid(rect: Rect, gridSize: number): Rect {
  return { ...rect, x: snapValueToGrid(rect.x, gridSize), y: snapValueToGrid(rect.y, gridSize) };
}

export interface SnapResult {
  x: number;
  y: number;
  /** Guide lines to draw, in board space, for whichever axis snapped. */
  guides: { x?: number; y?: number };
}

/**
 * Snaps a moving rect's position to nearby edges/centers of other rects when
 * within `threshold` board units. Checks left/center/right edges on X and
 * top/middle/bottom edges on Y independently, so a drag can snap on one axis
 * without the other.
 */
export function snapRectToItems(moving: Rect, others: Rect[], threshold = 8): SnapResult {
  let bestX: { value: number; dist: number; guide: number } | null = null;
  let bestY: { value: number; dist: number; guide: number } | null = null;

  const movingEdgesX = [
    { edge: moving.x, offset: 0 },
    { edge: moving.x + moving.w / 2, offset: moving.w / 2 },
    { edge: moving.x + moving.w, offset: moving.w },
  ];
  const movingEdgesY = [
    { edge: moving.y, offset: 0 },
    { edge: moving.y + moving.h / 2, offset: moving.h / 2 },
    { edge: moving.y + moving.h, offset: moving.h },
  ];

  for (const other of others) {
    const otherEdgesX = [other.x, other.x + other.w / 2, other.x + other.w];
    const otherEdgesY = [other.y, other.y + other.h / 2, other.y + other.h];

    for (const me of movingEdgesX) {
      for (const oe of otherEdgesX) {
        const dist = Math.abs(me.edge - oe);
        if (dist <= threshold && (!bestX || dist < bestX.dist)) {
          bestX = { value: oe - me.offset, dist, guide: oe };
        }
      }
    }
    for (const me of movingEdgesY) {
      for (const oe of otherEdgesY) {
        const dist = Math.abs(me.edge - oe);
        if (dist <= threshold && (!bestY || dist < bestY.dist)) {
          bestY = { value: oe - me.offset, dist, guide: oe };
        }
      }
    }
  }

  return {
    x: bestX ? bestX.value : moving.x,
    y: bestY ? bestY.value : moving.y,
    guides: { x: bestX?.guide, y: bestY?.guide },
  };
}

/** Axis-aligned bounding box of a set of rects; null if empty. */
export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
