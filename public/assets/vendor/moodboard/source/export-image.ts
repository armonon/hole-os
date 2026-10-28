/** Exporting the board itself as a flat image (PNG) and a one-page PDF.
 *
 * Split into a pure "draw plan" (testable without a real <canvas> or image
 * decoding) and a thin renderer that executes the plan against a real 2D
 * context in the browser.
 */
import { boundsOf, type Rect } from "./layout";
import type { Board, BoardItem } from "./board-types";

const PAGE_MARGIN = 32;

export type DrawOp =
  | { op: "frame"; rect: Rect; name: string }
  | { op: "image"; rect: Rect; src: string }
  | { op: "note"; rect: Rect; text: string; color: string }
  | { op: "swatch"; rect: Rect; color: string };

export interface DrawPlan {
  /** Pixel size of the exported canvas. */
  width: number;
  height: number;
  background: string;
  ops: DrawOp[];
}

/** Converts board items into an ordered list of draw operations positioned
 * relative to the board's own bounding box (so the export is cropped to
 * content, not to whatever the camera happened to be looking at). */
export function computeDrawPlan(board: Board, background = "#f6f3ec"): DrawPlan {
  const items = [...board.items].sort((a, b) => a.z - b.z);
  const bounds = boundsOf(items.map((it) => ({ x: it.x, y: it.y, w: it.w, h: it.h })));
  const originX = (bounds?.x ?? 0) - PAGE_MARGIN;
  const originY = (bounds?.y ?? 0) - PAGE_MARGIN;
  const width = Math.max(1, Math.ceil((bounds?.w ?? 0) + PAGE_MARGIN * 2));
  const height = Math.max(1, Math.ceil((bounds?.h ?? 0) + PAGE_MARGIN * 2));

  const toRect = (it: BoardItem): Rect => ({ x: it.x - originX, y: it.y - originY, w: it.w, h: it.h });

  const ops: DrawOp[] = items.map((it) => {
    const rect = toRect(it);
    switch (it.kind) {
      case "frame":
        return { op: "frame", rect, name: it.name };
      case "image":
        return { op: "image", rect, src: it.src };
      case "note":
        return { op: "note", rect, text: it.text, color: it.color };
      case "swatch":
        return { op: "swatch", rect, color: it.color };
    }
  });

  return { width, height, background, ops };
}

/** Loads a data: URL into an HTMLImageElement (browser only). */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not decode image for export: ${src.slice(0, 32)}...`));
    img.src = src;
  });
}

/** Renders a draw plan onto a real canvas 2D context. */
export async function renderPlanToCanvas(plan: DrawPlan, ctx: CanvasRenderingContext2D): Promise<void> {
  ctx.fillStyle = plan.background;
  ctx.fillRect(0, 0, plan.width, plan.height);

  for (const op of plan.ops) {
    if (op.op === "frame") {
      ctx.strokeStyle = "#bbb";
      ctx.lineWidth = 2;
      ctx.strokeRect(op.rect.x, op.rect.y, op.rect.w, op.rect.h);
      ctx.fillStyle = "#888";
      ctx.font = "12px sans-serif";
      ctx.fillText(op.name, op.rect.x + 4, op.rect.y - 6);
    } else if (op.op === "image") {
      const img = await loadImage(op.src);
      ctx.drawImage(img, op.rect.x, op.rect.y, op.rect.w, op.rect.h);
    } else if (op.op === "note") {
      ctx.fillStyle = op.color;
      ctx.fillRect(op.rect.x, op.rect.y, op.rect.w, op.rect.h);
      ctx.fillStyle = "#222";
      ctx.font = "13px sans-serif";
      wrapText(ctx, op.text, op.rect.x + 8, op.rect.y + 18, op.rect.w - 16, 16);
    } else if (op.op === "swatch") {
      ctx.fillStyle = op.color;
      ctx.fillRect(op.rect.x, op.rect.y, op.rect.w, op.rect.h);
    }
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/);
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

/** Renders the board to a PNG Blob (browser only). */
export async function exportBoardPng(board: Board): Promise<Blob> {
  const plan = computeDrawPlan(board);
  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  await renderPlanToCanvas(plan, ctx);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed"))), "image/png");
  });
}

// ---------------------------------------------------------------------------
// Minimal PDF writer: wraps a single JPEG image as a one-page PDF. No
// external PDF library — small enough to hand-write and much simpler than
// pulling in a dependency for a one-page "paste the board image" PDF.
// ---------------------------------------------------------------------------

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const enc = new TextEncoder();

/** Builds a valid single-page PDF embedding `jpegBytes` (a complete JPEG
 * file, e.g. from canvas.toDataURL("image/jpeg")) scaled to fill the page. */
export function buildPdfFromJpeg(jpegBytes: Uint8Array, widthPx: number, heightPx: number): Uint8Array {
  // 1pt = 1px keeps this simple and matches what most "print the canvas"
  // tools do for a one-page export; good enough for a reference PDF.
  const w = widthPx;
  const h = heightPx;

  const objects: Uint8Array[] = [];
  const offsets: number[] = [];
  const chunks: Uint8Array[] = [];
  let pos = 0;

  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    pos += bytes.length;
  };

  push(enc.encode("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"));

  const addObject = (body: Uint8Array) => {
    offsets.push(pos);
    push(body);
    objects.push(body);
  };

  const objNum = (n: number) => `${n} 0 obj\n`;

  addObject(enc.encode(`${objNum(1)}<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`));
  addObject(enc.encode(`${objNum(2)}<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`));
  addObject(
    enc.encode(
      `${objNum(3)}<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    ),
  );

  const imageHeader = enc.encode(
    `${objNum(4)}<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
  );
  const imageFooter = enc.encode("\nendstream\nendobj\n");
  addObject(concatBytes([imageHeader, jpegBytes, imageFooter]));

  const content = enc.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
  const contentObj = enc.encode(`${objNum(5)}<< /Length ${content.length} >>\nstream\n`);
  const contentFooter = enc.encode("\nendstream\nendobj\n");
  addObject(concatBytes([contentObj, content, contentFooter]));

  const xrefStart = pos;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  push(enc.encode(xref));
  push(
    enc.encode(
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`,
    ),
  );

  return concatBytes(chunks);
}

/** Renders the board to a one-page PDF Blob via a JPEG intermediate (browser only). */
export async function exportBoardPdf(board: Board): Promise<Blob> {
  const plan = computeDrawPlan(board);
  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  await renderPlanToCanvas(plan, ctx);
  const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const base64 = jpegDataUrl.slice(jpegDataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const pdfBytes = buildPdfFromJpeg(bytes, plan.width, plan.height);
  return new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
}
