/** The `.moodboard` single-file format: plain JSON, images embedded as data
 * URLs so one file is the whole board (portable, no external asset folder).
 * `serializeBoard`/`parseBoard` round-trip losslessly — proven in
 * tests/moodboard-file.test.ts.
 */
import { MOODBOARD_FORMAT_VERSION, type Board, type BoardItem } from "./board-types";

export class MoodboardFileError extends Error {}

export function serializeBoard(board: Board): string {
  return JSON.stringify(board);
}

function isBoardItem(value: unknown): value is BoardItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.kind === "string" &&
    typeof v.x === "number" &&
    typeof v.y === "number" &&
    typeof v.w === "number" &&
    typeof v.h === "number" &&
    typeof v.z === "number" &&
    Array.isArray(v.tags)
  );
}

export function parseBoard(json: string): Board {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new MoodboardFileError("Not a valid .moodboard file (invalid JSON).");
  }
  if (typeof raw !== "object" || raw === null) {
    throw new MoodboardFileError("Not a valid .moodboard file.");
  }
  const v = raw as Record<string, unknown>;
  if (v.version !== MOODBOARD_FORMAT_VERSION) {
    throw new MoodboardFileError(
      `Unsupported .moodboard version (${String(v.version)}). This app reads version ${MOODBOARD_FORMAT_VERSION}.`,
    );
  }
  if (!Array.isArray(v.items) || !v.items.every(isBoardItem)) {
    throw new MoodboardFileError("Not a valid .moodboard file (malformed items).");
  }
  if (typeof v.id !== "string" || typeof v.name !== "string") {
    throw new MoodboardFileError("Not a valid .moodboard file (missing id/name).");
  }
  const camera = v.camera as { x?: unknown; y?: unknown; zoom?: unknown } | undefined;
  return {
    version: MOODBOARD_FORMAT_VERSION,
    id: v.id,
    name: v.name,
    items: v.items as BoardItem[],
    camera: {
      x: typeof camera?.x === "number" ? camera.x : 0,
      y: typeof camera?.y === "number" ? camera.y : 0,
      zoom: typeof camera?.zoom === "number" ? camera.zoom : 1,
    },
    createdAt: typeof v.createdAt === "number" ? v.createdAt : Date.now(),
    updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : Date.now(),
  };
}

export function boardToFile(board: Board): Blob {
  return new Blob([serializeBoard(board)], { type: "application/json" });
}

export function downloadBoard(board: Board, filename = `${board.name || "board"}.moodboard`) {
  const blob = boardToFile(board);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
