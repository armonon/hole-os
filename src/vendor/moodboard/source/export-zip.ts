/** ZIP export: original image files + a layout.json describing positions,
 * sizes, tags and groups for every item on the board.
 */
import JSZip from "jszip";
import type { Board, BoardItem } from "./board-types";

/** Decodes a `data:<mime>;base64,<...>` URL into raw bytes. Pure/sync so it
 * works the same in the browser and under jsdom in tests (no fetch of
 * data: URLs needed). */
export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Not a data: URL");
  const mime = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3];
  if (!isBase64) {
    const decoded = decodeURIComponent(payload);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    return { bytes, mime };
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime };
}

/** Converts a data: URL back into a Blob (e.g. for handing an image to the
 * Locker's `sendTo`, which wants a Blob, not a data URL). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const { bytes, mime } = dataUrlToBytes(dataUrl);
  return new Blob([bytes as BlobPart], { type: mime });
}

function extensionFor(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  return map[mime] ?? "bin";
}

export interface LayoutJsonItem {
  id: string;
  kind: BoardItem["kind"];
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  tags: string[];
  groupId: string | null;
  /** Present for image items: the filename inside images/ in this ZIP. */
  file?: string;
  name?: string;
  text?: string;
  color?: string;
}

export interface LayoutJson {
  version: number;
  boardName: string;
  exportedAt: number;
  items: LayoutJsonItem[];
}

/** Builds the layout.json payload (also usable standalone, e.g. for tests). */
export function buildLayoutJson(board: Board, filenames: Map<string, string>): LayoutJson {
  return {
    version: board.version,
    boardName: board.name,
    exportedAt: Date.now(),
    items: board.items.map((it) => {
      const base: LayoutJsonItem = {
        id: it.id,
        kind: it.kind,
        x: it.x,
        y: it.y,
        w: it.w,
        h: it.h,
        z: it.z,
        tags: it.tags,
        groupId: it.groupId,
      };
      if (it.kind === "image") {
        base.name = it.name;
        base.file = filenames.get(it.id);
      } else if (it.kind === "note") {
        base.text = it.text;
        base.color = it.color;
      } else if (it.kind === "swatch") {
        base.color = it.color;
      } else if (it.kind === "frame") {
        base.name = it.name;
      }
      return base;
    }),
  };
}

/** Builds the exportable ZIP: images/<id>.<ext> for every image item, plus
 * layout.json at the root. Returns a Blob ready to download. */
export async function buildExportZip(board: Board): Promise<Blob> {
  const zip = new JSZip();
  const images = zip.folder("images")!;
  const filenames = new Map<string, string>();

  for (const item of board.items) {
    if (item.kind !== "image") continue;
    const { bytes, mime } = dataUrlToBytes(item.src);
    const safeName = item.name.replace(/[^a-z0-9.\-_]+/gi, "_") || item.id;
    const ext = extensionFor(mime);
    const filename = safeName.toLowerCase().endsWith(`.${ext}`) ? safeName : `${safeName}.${ext}`;
    filenames.set(item.id, filename);
    images.file(filename, bytes);
  }

  const layout = buildLayoutJson(board, filenames);
  zip.file("layout.json", JSON.stringify(layout, null, 2));

  return zip.generateAsync({ type: "blob" });
}
