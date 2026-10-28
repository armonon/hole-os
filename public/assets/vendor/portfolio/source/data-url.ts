/**
 * Small data: URL helpers shared by the file importer (image/video/GLB →
 * data URL, for portable storage), the static-site export (data URL →
 * bytes, written into assets/), and tests.
 */

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Not a valid data URL");
  const [, mime = "application/octet-stream", isBase64, payload] = match;
  if (isBase64) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { bytes, mime };
  }
  const bytes = new TextEncoder().encode(decodeURIComponent(payload));
  return { bytes, mime };
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "model/gltf-binary": ".glb",
  "model/gltf+json": ".gltf",
};

export function extensionForMime(mime: string, fallbackName = ""): string {
  if (EXTENSION_BY_MIME[mime]) return EXTENSION_BY_MIME[mime];
  const match = /\.[a-zA-Z0-9]+$/.exec(fallbackName);
  if (match) return match[0].toLowerCase();
  return "";
}

export function kindForMime(mime: string, fallbackName = ""): "image" | "video" | "model" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("model/") || /\.glb$/i.test(fallbackName) || /\.gltf$/i.test(fallbackName)) return "model";
  return "image";
}
